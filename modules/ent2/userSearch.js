// ent2 User Search & Autocomplete Module
if (typeof ent2DataJsonCache === 'undefined') {
    var ent2DataJsonCache = null;
    var ent2DataJsonLowerMap = null;
    var ent2DataEntries = null; // Array of { nickname, id, lower }
    var ent2DbLoadingPromise = null;
}

function openEnt2IndexedDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('ent2_db_cache', 1);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('cache')) {
                db.createObjectStore('cache', { keyPath: 'id' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function buildEnt2DataIndex(data) {
    if (!data) return;
    ent2DataJsonLowerMap = new Map();
    ent2DataEntries = [];
    const keys = Object.keys(data);
    for (let i = 0; i < keys.length; i++) {
        const nick = keys[i];
        const id = data[nick];
        if (nick && id) {
            const lower = nick.toLowerCase();
            ent2DataJsonLowerMap.set(lower, { originalKey: nick, id });
            ent2DataEntries.push({ nickname: nick, id, lower });
        }
    }
}

async function getOrFetchEnt2DataJson(onProgress, forceRefresh = false) {
    if (!forceRefresh && ent2DataJsonCache && ent2DataEntries && ent2DataEntries.length > 0) {
        if (onProgress) onProgress(`DB 준비 완료 (${ent2DataEntries.length.toLocaleString()}명)`);
        return ent2DataJsonCache;
    }
    if (ent2DbLoadingPromise && !forceRefresh) {
        return ent2DbLoadingPromise;
    }

    ent2DbLoadingPromise = (async () => {
        let cached = null;
        if (!forceRefresh) {
            try {
                if (onProgress) onProgress('캐시 확인 중...');
                const db = await openEnt2IndexedDb();
                const tx = db.transaction('cache', 'readonly');
                const store = tx.objectStore('cache');
                const req = store.get('data_json');
                
                cached = await new Promise((resolve) => {
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = () => resolve(null);
                });

                if (cached && cached.data) {
                    ent2DataJsonCache = cached.data;
                    buildEnt2DataIndex(ent2DataJsonCache);
                    const updateTimeStr = cached.updatedAt ? new Date(cached.updatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '';
                    if (onProgress) onProgress(`DB 로드됨 (${ent2DataEntries.length.toLocaleString()}명, ${updateTimeStr})`);
                    
                    // If cache is reasonably fresh (< 1 hour), return cached data and do background refresh
                    const isStale = !cached.updatedAt || (Date.now() - cached.updatedAt > 1000 * 60 * 60);
                    if (!isStale) {
                        return ent2DataJsonCache;
                    }
                }
            } catch (e) {
                console.warn('[ent2] IndexedDB access failed, fetching raw file:', e);
            }
        }

        try {
            if (onProgress) onProgress('최신 data.json (7.5MB) 다운로드 중...');
const localUrl = chrome.runtime.getURL('data.json');
const res = await fetch(localUrl);
            if (!res.ok) throw new Error('data.json fetch HTTP error ' + res.status);
            
            const data = await res.json();
            ent2DataJsonCache = data;
            buildEnt2DataIndex(data);

            const now = Date.now();
            try {
                const db = await openEnt2IndexedDb();
                const tx = db.transaction('cache', 'readwrite');
                tx.objectStore('cache').put({ id: 'data_json', data, updatedAt: now });
            } catch (err) {}

            const updateTimeStr = new Date(now).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
            if (onProgress) onProgress(`최신 DB 업데이트 완료 (${ent2DataEntries.length.toLocaleString()}명, ${updateTimeStr})`);
            return data;
        } catch (err) {
            console.error('[ent2] Failed to load data.json:', err);
            if (cached && cached.data) {
                ent2DataJsonCache = cached.data;
                buildEnt2DataIndex(cached.data);
                if (onProgress) onProgress(`캐시 DB 사용 중 (${ent2DataEntries.length.toLocaleString()}명)`);
                return cached.data;
            }
            if (onProgress) onProgress('DB 로드 실패 (온라인 API 검색 모드)');
            return {};
        } finally {
            ent2DbLoadingPromise = null;
        }
    })();

    return ent2DbLoadingPromise;
}

function formatNicknameDisplay(nickname) {
    if (!nickname) return '<span style="opacity:0.65; font-style:italic;">(공백 닉네임)</span>';
    const clean = String(nickname).replace(/[\s\u200B-\u200D\uFEFF\u00A0]/g, '');
    if (clean.length === 0) {
        return '<span style="opacity:0.65; font-style:italic;">(공백 닉네임)</span>';
    }
    return escapeHtml(nickname);
}

function getCharGroupPriority(str) {
    if (!str) return 3;
    const cleanStr = String(str).replace(/^[\s\u200B-\u200D\uFEFF\u00A0]+/, '');
    if (!cleanStr) return 3;
    const firstChar = cleanStr.charAt(0);
    // 0: 한글 (가-힣, ㄱ-ㅎ, ㅏ-ㅣ)
    if (/^[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(firstChar)) {
        return 0;
    }
    // 1: 영문 (a-z, A-Z)
    if (/^[a-zA-Z]/.test(firstChar)) {
        return 1;
    }
    // 2: 숫자 (0-9)
    if (/^[0-9]/.test(firstChar)) {
        return 2;
    }
    return 3; // 기타
}

function compareNicknamesKoEn(a, b) {
    const nickA = a.nickname || '';
    const nickB = b.nickname || '';
    const groupA = getCharGroupPriority(nickA);
    const groupB = getCharGroupPriority(nickB);

    if (groupA !== groupB) {
        return groupA - groupB;
    }
    return nickA.localeCompare(nickB, 'ko', { numeric: true, sensitivity: 'base' });
}

function searchInEnt2DataJson(queryVal, limit = 50) {
    if (!queryVal) return [];
    const qTrim = queryVal.trim();
    if (!qTrim) return [];
    const qLower = qTrim.toLowerCase();

    const startsWithMatches = [];
    const includesMatches = [];
    const addedIds = new Set();

    // 1. Direct exact key match (O(1))
    if (ent2DataJsonCache && ent2DataJsonCache[qTrim]) {
        const id = ent2DataJsonCache[qTrim];
        startsWithMatches.push({ nickname: qTrim, id, matchType: 'exact' });
        addedIds.add(id);
    } else if (ent2DataJsonLowerMap) {
        const lowerMatch = ent2DataJsonLowerMap.get(qLower);
        if (lowerMatch) {
            startsWithMatches.push({ nickname: lowerMatch.originalKey, id: lowerMatch.id, matchType: 'exact' });
            addedIds.add(lowerMatch.id);
        }
    }

    // 2. Direct 24-hex ObjectId check
    if (/^[0-9a-fA-F]{24}$/.test(qTrim)) {
        if (!addedIds.has(qTrim)) {
            startsWithMatches.push({ nickname: `ID: ${qTrim}`, id: qTrim, isDirectId: true, matchType: 'exact' });
            addedIds.add(qTrim);
        }
    }

    // 3. Scan ent2DataEntries: 1순위 startsWith, 2순위 includes
    if (ent2DataEntries) {
        for (let i = 0; i < ent2DataEntries.length; i++) {
            const item = ent2DataEntries[i];
            if (addedIds.has(item.id)) continue;

            if (item.lower.startsWith(qLower)) {
                startsWithMatches.push({ nickname: item.nickname, id: item.id, matchType: 'prefix' });
                addedIds.add(item.id);
            } else if (item.lower.includes(qLower)) {
                includesMatches.push({ nickname: item.nickname, id: item.id, matchType: 'includes' });
                addedIds.add(item.id);
            }
        }
    }

    // 정렬 (ps. ㄱㄴㄷ -> abc -> 123)
    startsWithMatches.sort(compareNicknamesKoEn);
    includesMatches.sort(compareNicknamesKoEn);

    // 결합: 1. 시작하는 단어 -> 2. 포함되어 있는 단어
    const combined = [...startsWithMatches, ...includesMatches];

    return combined.slice(0, limit);
}

async function performEnt2UserSearch(queryTerm) {
    if (!queryTerm) return null;
    const cleanQuery = queryTerm.trim();
    if (!cleanQuery) return null;

    await getOrFetchEnt2DataJson();
    
    // 1. Local data.json search
    const matches = searchInEnt2DataJson(cleanQuery, 1);
    if (matches.length > 0) {
        return {
            query: cleanQuery,
            id: matches[0].id,
            nickname: matches[0].nickname,
            source: 'data.json'
        };
    }

    // 2. Direct 24-hex ObjectId check
    if (/^[0-9a-fA-F]{24}$/.test(cleanQuery)) {
        return {
            query: cleanQuery,
            id: cleanQuery,
            nickname: cleanQuery,
            source: 'direct_id'
        };
    }

    // 3. Fallback to Playentry GraphQL API
    const csrfToken = typeof getCSRFToken === 'function' ? getCSRFToken() : '';
    try {
        const res = await fetch('https://playentry.org/graphql/SELECT_USER_BY_NICKNAME', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'csrf-token': csrfToken || '',
                'x-client-type': 'Client'
            },
            body: JSON.stringify({
                query: `query SELECT_USER_BY_NICKNAME($nickname: String!) { user(nickname: $nickname) { id nickname username profileImage { filename } } }`,
                variables: { nickname: cleanQuery }
            })
        });
        const json = await res.json();
        const user = json?.data?.user;
        if (user && user.id) {
            return {
                query: cleanQuery,
                id: user.id,
                nickname: user.nickname || cleanQuery,
                username: user.username,
                avatar: user.profileImage?.filename ? `https://playentry.org/uploads/${user.profileImage.filename.slice(0, 2)}/${user.profileImage.filename.slice(2, 4)}/${user.profileImage.filename}.png` : null,
                source: 'graphql_api'
            };
        }
    } catch (e) {
        console.warn('[ent2] GraphQL user search error:', e);
    }

    return null;
}

function renderEnt2UserSearchTab(container, isDark, profileIdParam, navTo) {
    const svgSearchIcon = `<svg style="width:20px; height:20px; color:#3182f6;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.3" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>`;
    const svgDbIcon = `<svg style="width:14px; height:14px; color:#3182f6;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21 3.582 4 8 4s8-1.79 8-4"/></svg>`;

    container.innerHTML = `
        <div class="ent2-card-box" style="background:${isDark ? '#19191d' : '#ffffff'}; border:1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}; border-radius:28px; padding:32px; box-shadow:0 12px 32px rgba(0,0,0,0.04); position:relative; margin-bottom:24px;">
            <div style="margin-bottom:20px; display:flex; align-items:flex-start; justify-content:space-between; flex-wrap:wrap; gap:12px;">
                <div>
                    <h2 style="font-size:20px; font-weight:800; margin:0 0 8px 0; display:flex; align-items:center; gap:8px;">
                        ${svgSearchIcon} ent2 유저 검색 & 실시간 자동완성
                    </h2>
                    <p style="font-size:13px; color:${isDark ? '#8b95a1' : '#6b7684'}; margin:0; font-weight:500;">
                        EntryUser 데이터베이스(data.json) 기반 초고속 검색. 닉네임 또는 고유 ID를 입력하세요.
                    </p>
                </div>
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                    <div id="ent2-db-status-badge" style="font-size:11.5px; font-weight:700; color:#3182f6; background:rgba(49,130,246,0.1); padding:6px 14px; border-radius:20px; display:inline-flex; align-items:center; gap:6px;">
                        ${svgDbIcon} <span id="ent2-db-status-text">DB 확인 중...</span>
                    </div>
                    <button id="ent2-db-refresh-btn" title="GitHub에서 최신 data.json 다운로드 및 색인 업데이트" style="font-size:11.5px; font-weight:700; color:${isDark ? '#f8fafc' : '#334155'}; background:${isDark ? '#27272a' : '#f1f5f9'}; border:1px solid ${isDark ? '#3f3f46' : '#cbd5e1'}; padding:6px 12px; border-radius:20px; cursor:pointer; display:inline-flex; align-items:center; gap:5px; transition:all 0.15s;">
                        <span>최신 DB 업데이트</span>
                    </button>
                </div>
            </div>

            <!-- 검색바 및 자동완성 드롭다운 -->
            <div style="position:relative;">
                <div style="display:flex; align-items:center;">
                    <input id="ent2-user-search-input" class="ent2-search-input-box" type="text" placeholder="닉네임 또는 고유 ID 입력" autocomplete="off" style="width:100%; padding:16px 120px 16px 18px; font-size:14.5px; font-weight:600; border-radius:18px; border:2px solid ${isDark ? 'rgba(255,255,255,0.12)' : '#e5e8eb'}; background:${isDark ? '#101013' : '#f9fafb'}; color:${isDark ? '#f2f4f6' : '#191f28'}; outline:none; box-sizing:border-box;">
                    <button id="ent2-user-search-btn" class="ent2-search-btn" style="position:absolute; right:8px; top:8px; bottom:8px; padding:0 20px; background:#3182f6; color:#ffffff; font-size:13.5px; font-weight:700; border:none; border-radius:14px; cursor:pointer; transition:all 0.2s; box-shadow:0 6px 16px rgba(49,130,246,0.3); display:inline-flex; align-items:center; gap:6px;">
                        <span>검색</span>
                        <svg style="width:14px; height:14px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                    </button>
                </div>

                <!-- Autocomplete Box -->
                <div id="ent2-autocomplete-box" style="display:none; position:absolute; top:calc(100% + 8px); left:0; right:0; background:${isDark ? '#19191d' : '#ffffff'}; border:1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}; border-radius:20px; box-shadow:0 16px 36px rgba(0,0,0,0.15); z-index:999; max-height:380px; overflow-y:auto; padding:8px 0;">
                </div>
            </div>
        </div>

        <!-- 프로필 탐색 결과 영역 -->
        <div id="ent2-profile-display-area"></div>
    `;

    const inputEl = container.querySelector('#ent2-user-search-input');
    const btnEl = container.querySelector('#ent2-user-search-btn');
    const autoBox = container.querySelector('#ent2-autocomplete-box');
    const displayArea = container.querySelector('#ent2-profile-display-area');
    const dbBadge = container.querySelector('#ent2-db-status-badge');
    const dbStatusText = container.querySelector('#ent2-db-status-text');
    const dbRefreshBtn = container.querySelector('#ent2-db-refresh-btn');

    const updateDbStatus = (msg) => {
        if (dbStatusText) dbStatusText.textContent = msg;
        else if (dbBadge) dbBadge.innerHTML = `${svgDbIcon} ${escapeHtml(msg)}`;
    };

    // Trigger pre-fetching/caching of data.json immediately
    getOrFetchEnt2DataJson(updateDbStatus);

    if (dbRefreshBtn) {
        dbRefreshBtn.onclick = async () => {
            dbRefreshBtn.disabled = true;
            dbRefreshBtn.style.opacity = '0.6';
            updateDbStatus('최신 DB 다운로드 시작...');
            try {
                await getOrFetchEnt2DataJson(updateDbStatus, true);
            } catch (err) {
                updateDbStatus('DB 업데이트 실패');
            } finally {
                dbRefreshBtn.disabled = false;
                dbRefreshBtn.style.opacity = '1';
            }
        };
    }

    let debounceTimer = null;

    const hideAutoBox = () => {
        if (autoBox) autoBox.style.display = 'none';
    };

    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
            hideAutoBox();
        }
    });

    const triggerUserExplore = async (userId, userNickname, avatarUrl) => {
        hideAutoBox();
        if (!userId) return;

        // Save to History
        await logEnt2SearchHistory({
            id: userId,
            nickname: userNickname || userId,
            query: userNickname || userId,
            avatar: avatarUrl || 'https://playentry.org/img/DefaultCardUserThmb.svg'
        });

        // Update URL and Load Profile Data directly in this view
        window.history.pushState({}, '', `/ent2/profile/${userId}`);
        loadEnt2FullUserProfile(displayArea, isDark, userId, navTo);
    };

    const fetchAutocomplete = async (q) => {
        if (!q || q.trim().length === 0) {
            hideAutoBox();
            return;
        }
        const queryVal = q.trim();

        // Ensure data.json is loaded
        await getOrFetchEnt2DataJson();

        // Fast local search in data.json (max 50 preview items)
        const localMatches = searchInEnt2DataJson(queryVal, 50);

        autoBox.style.maxHeight = '440px';
        autoBox.style.overflowY = 'auto';

        if (localMatches.length > 0) {
            const headerHtml = `
                <div style="padding:10px 16px; font-size:11px; font-weight:700; color:${isDark ? '#94a3b8' : '#64748b'}; border-bottom:1px solid ${isDark ? '#2a3749' : '#e2e8f0'}; background:${isDark ? '#1a2332' : '#f8fafc'}; display:flex; align-items:center; justify-content:space-between; position:sticky; top:0; z-index:10; backdrop-filter:blur(8px);">
                    <span>실시간 검색 미리보기 (${localMatches.length}개)</span>
                    <span style="font-size:10px; color:${isDark ? '#64748b' : '#94a3b8'};">1.시작 / 2.포함 (한글 / 영문순)</span>
                </div>
            `;

            const itemsHtml = localMatches.map(u => {
                const avatarUrl = 'https://playentry.org/img/DefaultCardUserThmb.svg';
                let matchBadge = '';
                if (u.matchType === 'exact') {
                    matchBadge = '<span style="font-size:10px; background:#22c55e; color:#fff; padding:1px 6px; border-radius:4px; margin-left:6px; font-weight:700;">정확 일치</span>';
                } else if (u.matchType === 'prefix') {
                    matchBadge = '<span style="font-size:10px; background:rgba(0,122,255,0.15); color:#007aff; padding:1px 6px; border-radius:4px; margin-left:6px; font-weight:700;">시작</span>';
                } else if (u.matchType === 'includes') {
                    matchBadge = '<span style="font-size:10px; background:rgba(139,92,246,0.15); color:#8b5cf6; padding:1px 6px; border-radius:4px; margin-left:6px; font-weight:700;">포함</span>';
                }

                return `
                    <div class="ent2-auto-item" data-id="${u.id}" data-nickname="${escapeHtml(u.nickname || '')}" data-avatar="${avatarUrl}" style="padding:12px 18px; display:flex; align-items:center; justify-content:space-between; gap:12px; cursor:pointer; transition:background 0.15s; border-bottom:1px solid ${isDark ? '#2a3749' : '#f1f5f9'};">
                        <div style="display:flex; align-items:center; gap:12px; overflow:hidden;">
                            <img src="${avatarUrl}" style="width:36px; height:36px; border-radius:50%; object-fit:cover; flex-shrink:0;">
                            <div style="overflow:hidden;">
                                <div style="font-size:14px; font-weight:700; color:${isDark ? '#f8fafc' : '#0f172a'}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; display:flex; align-items:center;">
                                    <span>${formatNicknameDisplay(u.nickname)}</span> ${matchBadge}
                                </div>
                                <div style="font-size:11px; color:${isDark ? '#94a3b8' : '#64748b'}; margin-top:2px;">
                                    ID: ${u.id}
                                </div>
                            </div>
                        </div>
                        <span style="font-size:11.5px; font-weight:700; color:#007aff; background:rgba(0,122,255,0.1); padding:4px 12px; border-radius:8px; flex-shrink:0; display:inline-flex; align-items:center; gap:4px;">
                            <span>프로필 탐색</span>
                            <svg style="width:12px; height:12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                        </span>
                    </div>
                `;
            }).join('');

            autoBox.innerHTML = headerHtml + itemsHtml;

            autoBox.querySelectorAll('.ent2-auto-item').forEach(item => {
                item.addEventListener('mouseenter', () => {
                    item.style.background = isDark ? '#0f172a' : '#f8fafc';
                });
                item.addEventListener('mouseleave', () => {
                    item.style.background = 'transparent';
                });
                item.addEventListener('click', () => {
                    const id = item.getAttribute('data-id');
                    const nick = item.getAttribute('data-nickname');
                    const av = item.getAttribute('data-avatar');
                    triggerUserExplore(id, nick, av);
                });
            });

            autoBox.style.display = 'block';
            return;
        }

        // Fallback to GraphQL if no local match
        try {
            const graphqlQueryStr = `
                query SELECT_USER_LIST($query: String, $pageParam: PageParam) {
                    userList(query: $query, pageParam: $pageParam) {
                        total
                        list {
                            id
                            nickname
                            username
                            profileImage { id filename imageType }
                        }
                    }
                }
            `;

            const res = await fetch('https://playentry.org/graphql/SELECT_USER_LIST', {
                method: 'POST',
                headers: typeof getPlayEntryFetchHeaders === 'function' ? getPlayEntryFetchHeaders() : { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    query: graphqlQueryStr,
                    variables: { query: queryVal, pageParam: { display: 8, sort: "created" } }
                })
            });

            const data = await res.json();
            const userList = data?.data?.userList?.list || [];

            if (userList.length === 0) {
                autoBox.innerHTML = `
                    <div style="padding:16px; text-align:center; font-size:12.5px; color:${isDark ? '#94a3b8' : '#64748b'};">
                        일치하는 유저가 없습니다.
                    </div>
                `;
                autoBox.style.display = 'block';
                return;
            }

            autoBox.innerHTML = userList.map(u => `
                <div class="ent2-auto-item" data-id="${u.id}" data-nickname="${escapeHtml(u.nickname || '')}" style="padding:12px 18px; display:flex; align-items:center; justify-content:space-between; gap:12px; cursor:pointer;">
                    <div>
                        <div style="font-size:14px; font-weight:700; color:${isDark ? '#f8fafc' : '#0f172a'};">${escapeHtml(u.nickname || '익명')}</div>
                        <div style="font-size:11px; color:${isDark ? '#94a3b8' : '#64748b'};">ID: ${u.id}</div>
                    </div>
                    <span style="font-size:11.5px; font-weight:700; color:#007aff; background:rgba(0,122,255,0.1); padding:4px 12px; border-radius:8px; display:inline-flex; align-items:center; gap:4px;">
                        <span>프로필 탐색</span>
                        <svg style="width:12px; height:12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                    </span>
                </div>
            `).join('');

            autoBox.querySelectorAll('.ent2-auto-item').forEach(item => {
                item.onclick = () => {
                    const id = item.getAttribute('data-id');
                    const nick = item.getAttribute('data-nickname');
                    triggerUserExplore(id, nick, null);
                };
            });

            autoBox.style.display = 'block';
        } catch (e) {
            console.error('[ent2] Autocomplete fallback error:', e);
        }
    };

    inputEl.oninput = () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            fetchAutocomplete(inputEl.value);
        }, 120);
    };

    const handleSearchClick = async () => {
        const query = inputEl.value.trim();
        if (!query) return;

        displayArea.innerHTML = `<div style="padding:24px; text-align:center; color:#007aff; font-weight:700; font-size:13.5px;">EntryUser DB 탐색 중...</div>`;
        const res = await performEnt2UserSearch(query);
        if (res && res.id) {
            triggerUserExplore(res.id, res.nickname, res.avatar);
        } else {
            displayArea.innerHTML = `
                <div style="padding:20px; background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.2); border-radius:16px; color:#ef4444; font-size:13px; font-weight:700; text-align:center; display:flex; align-items:center; justify-content:center; gap:8px;">
                    <svg style="width:18px; height:18px; color:#ef4444;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                    <span>'${escapeHtml(query)}' 유저를 찾을 수 없습니다.</span>
                </div>
            `;
        }
    };

    btnEl.onclick = handleSearchClick;
    inputEl.onkeyup = (e) => {
        if (e.key === 'Enter') handleSearchClick();
    };

    if (profileIdParam) {
        inputEl.value = profileIdParam;
        loadEnt2FullUserProfile(displayArea, isDark, profileIdParam, navTo);
    }
}

