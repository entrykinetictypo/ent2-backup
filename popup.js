document.addEventListener('DOMContentLoaded', () => {
  const apiInput = document.getElementById('apiServerUrl');
  const saveBtn = document.getElementById('btn-save-api');
  const clearHistoryBtn = document.getElementById('btn-clear-history');
  const enabledToggle = document.getElementById('toggle-ent2-enabled');
  const enabledDesc = document.getElementById('ent2-enabled-desc');
  const mobileToggle = document.getElementById('toggle-ent2-mobile');
  const mobileDesc = document.getElementById('ent2-mobile-desc');
  const funToggle = document.getElementById('toggle-ent2-fun');
  const funDesc = document.getElementById('ent2-fun-desc');
  const statusBadge = document.querySelector('.status-badge');

  const btnUser = document.getElementById('btn-ent2-user');
  const btnComm = document.getElementById('btn-ent2-comm');
  const btnProfile = document.getElementById('btn-ent2-profile');
  const btnHome = document.getElementById('btn-ent2-home');

  const badgeEnabled = document.getElementById('badge-ent2-enabled');
  const badgeMobile = document.getElementById('badge-ent2-mobile');
  const badgeFun = document.getElementById('badge-ent2-fun');

  function updateStatusUI(isEnabled) {
    if (badgeEnabled) {
      badgeEnabled.textContent = isEnabled ? "켜짐" : "꺼짐";
      badgeEnabled.style.background = isEnabled ? "#10b981" : "#ef4444";
    }
    if (enabledDesc) {
      enabledDesc.textContent = isEnabled 
        ? "엔트리 사이트에서 ent2 확장 기능 버튼 및 메뉴를 활성화합니다." 
        : "ent2 확장 기능이 꺼져 있습니다.";
      enabledDesc.style.color = isEnabled ? "var(--text-muted)" : "#ef4444";
    }
    if (statusBadge) {
      statusBadge.innerHTML = isEnabled
        ? `<span class="status-dot"></span> ent2 서비스가 연결되었습니다`
        : `<span class="status-dot" style="background:#ef4444;"></span> ent2 연결이 비활성화되었습니다`;
      statusBadge.style.color = isEnabled ? "#047857" : "#b91c1c";
      if (statusBadge.parentElement) {
        statusBadge.parentElement.style.background = isEnabled ? "#ebfbf5" : "#fef2f2";
        statusBadge.parentElement.style.borderColor = isEnabled ? "#a7f3d0" : "#fecaca";
      }
    }
  }

  function updateMobileUIStatus(isMobileEnabled) {
    if (badgeMobile) {
      badgeMobile.textContent = isMobileEnabled ? "켜짐" : "꺼짐";
      badgeMobile.style.background = isMobileEnabled ? "#10b981" : "#ef4444";
    }
    if (mobileDesc) {
      mobileDesc.textContent = isMobileEnabled
        ? "모바일 메뉴에 ent2 바로가기 메뉴를 표시합니다."
        : "모바일 메뉴 연동이 꺼져 있습니다.";
      mobileDesc.style.color = isMobileEnabled ? "var(--text-muted)" : "#ef4444";
    }
  }

  function updateFunUIStatus(isFunEnabled) {
    if (badgeFun) {
      badgeFun.textContent = isFunEnabled ? "켜짐 (Fun)" : "꺼짐";
      badgeFun.style.background = isFunEnabled ? "#ec4899" : "#64748b";
    }
    if (funDesc) {
      funDesc.textContent = isFunEnabled
        ? "Fun 정렬 모드가 활성화되었습니다. 정렬 옵션에 '-좋아요', '-댓글'이 추가됩니다."
        : "커뮤니티 및 작품 탐색 정렬 옵션에 '-좋아요', '-댓글' 등 이색 정렬 방식을 추가합니다.";
      funDesc.style.color = isFunEnabled ? "#ec4899" : "var(--text-muted)";
    }
  }

  // Load ent2_enabled, ent2_mobile_enabled, ent2_fun_enabled & API Server URL
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get({
      ent2_enabled: true,
      ent2_mobile_enabled: true,
      ent2_fun_enabled: false,
      apiServerUrl: "https://playentry.org"
    }, (res) => {
      if (apiInput) apiInput.value = res.apiServerUrl;
      if (enabledToggle) {
        enabledToggle.checked = res.ent2_enabled;
        updateStatusUI(res.ent2_enabled);
      }
      if (mobileToggle) {
        mobileToggle.checked = res.ent2_mobile_enabled;
        updateMobileUIStatus(res.ent2_mobile_enabled);
      }
      if (funToggle) {
        funToggle.checked = !!res.ent2_fun_enabled;
        updateFunUIStatus(!!res.ent2_fun_enabled);
      }
    });
  }

  // Toggle switch listeners
  if (enabledToggle) {
    enabledToggle.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      updateStatusUI(isChecked);
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ ent2_enabled: isChecked });
      }
    });
  }

  if (mobileToggle) {
    mobileToggle.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      updateMobileUIStatus(isChecked);
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ ent2_mobile_enabled: isChecked });
      }
    });
  }

  if (funToggle) {
    funToggle.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      updateFunUIStatus(isChecked);
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ ent2_fun_enabled: isChecked });
      }
    });
  }

  // Save API Server URL
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const val = apiInput ? apiInput.value.trim() : '';
      if (!val) return;
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ apiServerUrl: val }, () => {
          alert('ent2 API 서버 주소가 저장되었습니다.');
        });
      }
    });
  }

  // Clear search history
  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', () => {
      if (confirm('ent2 최근 검색 기록을 모두 삭제하시겠습니까?')) {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.remove(['ent2_search_history', 'ent2_recent_users'], () => {
            alert('검색 기록이 삭제되었습니다.');
          });
        }
      }
    });
  }

  // Navigation handlers
  function openEnt2Route(route) {
    const targetUrl = `https://playentry.org${route}`;
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0] && tabs[0].url && tabs[0].url.includes('playentry.org')) {
          chrome.tabs.update(tabs[0].id, { url: targetUrl });
        } else {
          chrome.tabs.create({ url: targetUrl });
        }
      });
    } else {
      window.open(targetUrl, '_blank');
    }
  }

  if (btnUser) btnUser.addEventListener('click', () => openEnt2Route('/ent2/user'));
  if (btnComm) btnComm.addEventListener('click', () => openEnt2Route('/ent2/comm'));
  if (btnProfile) btnProfile.addEventListener('click', () => openEnt2Route('/ent2/profile'));
  if (btnHome) btnHome.addEventListener('click', () => openEnt2Route('/ent2'));
});
