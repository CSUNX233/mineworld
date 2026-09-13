import './privacy.css';

const CONSENT_KEY = 'mineworld-privacy-consent';
const POLICY_VERSION = '2026-09-14';

/** Policy stays local in the APK; the same file is published for store review. */
export function showPrivacyPolicy(allowWithdraw = false): void {
  const dialog = document.createElement('dialog');
  dialog.className = 'privacy-dialog';
  dialog.setAttribute('aria-label', '隐私政策');
  const header = document.createElement('header');
  const title = document.createElement('strong');
  title.textContent = '隐私政策';
  const close = document.createElement('button');
  close.textContent = '关闭';
  close.onclick = () => dialog.close();
  header.append(title, close);
  const frame = document.createElement('iframe');
  frame.src = `${import.meta.env.BASE_URL}privacy.html`;
  frame.title = '深渊，请等一下隐私政策全文';
  dialog.append(header, frame);
  if (allowWithdraw) {
    const withdraw = document.createElement('button');
    withdraw.textContent = '撤回同意（保留存档）';
    withdraw.onclick = () => {
      try { localStorage.removeItem(CONSENT_KEY); } catch { /* No persisted consent. */ }
      // Reload stops the running game and returns to the gate without touching saves.
      location.reload();
    };
    dialog.append(withdraw);
  }
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  document.body.append(dialog);
  dialog.showModal();
}

export async function requestPrivacyConsent(): Promise<void> {
  try { if (localStorage.getItem(CONSENT_KEY) === POLICY_VERSION) return; } catch { /* Session-only choice. */ }
  return new Promise(resolve => {
    const gate = document.createElement('section');
    gate.className = 'privacy-gate';
    gate.setAttribute('aria-label', '欢迎与隐私说明');
    gate.innerHTML = `<article><h1>进入深渊之前</h1><p>欢迎来到《深渊，请等一下》。请先阅读桑尼工作室的隐私政策。</p><p>当前版本无账号、无广告、无内购。存档、营地研究和设置保存在本机；设备适配信息仅用于本地运行。网页版加载资源时，托管服务会收到必要的网络连接信息。</p><p>未成年人请在监护人指导下阅读。您可以在主菜单随时查看政策或撤回同意。</p><button type="button" data-policy>阅读完整隐私政策</button><p class="privacy-message" role="status"></p><footer><button type="button" data-reject>不同意</button><button type="button" data-accept>同意并继续</button></footer></article>`;
    gate.querySelector<HTMLButtonElement>('[data-policy]')!.onclick = () => showPrivacyPolicy();
    gate.querySelector<HTMLButtonElement>('[data-reject]')!.onclick = () => {
      gate.querySelector('.privacy-message')!.textContent = '已保留您的选择，游戏尚未启动。您可以关闭应用，或阅读政策后重新选择。';
    };
    gate.querySelector<HTMLButtonElement>('[data-accept]')!.onclick = () => {
      try { localStorage.setItem(CONSENT_KEY, POLICY_VERSION); } catch { /* Consent applies only to this session. */ }
      gate.remove();
      resolve();
    };
    document.body.append(gate);
  });
}
