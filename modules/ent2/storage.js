// ent2 Storage & Global Helper Utility Module
if (typeof Ent2Storage === 'undefined') {
    var Ent2Storage = {
        get: async (key, defaultValue = null) => {
            return new Promise((resolve) => {
                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                    chrome.storage.local.get([key], (result) => {
                        resolve(result[key] !== undefined ? result[key] : defaultValue);
                    });
                } else {
                    try {
                        const item = localStorage.getItem(key);
                        resolve(item ? JSON.parse(item) : defaultValue);
                    } catch (e) {
                        resolve(defaultValue);
                    }
                }
            });
        },
        set: async (key, value) => {
            return new Promise((resolve) => {
                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                    chrome.storage.local.set({ [key]: value }, () => resolve());
                } else {
                    try {
                        localStorage.setItem(key, JSON.stringify(value));
                    } catch (e) {}
                    resolve();
                }
            });
        }
    };
}

function getCSRFToken() {
    const metaToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
    if (metaToken) return metaToken;
    const cookieMatch = document.cookie.match(/csrfToken=([^;]+)/);
    if (cookieMatch) return decodeURIComponent(cookieMatch[1]);
    return null;
}

function getPlayEntryFetchHeaders() {
    const headers = {
        'Content-Type': 'application/json',
        'x-client-type': 'Client'
    };
    const csrf = getCSRFToken();
    if (csrf) headers['csrf-token'] = csrf;
    return headers;
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
