import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CheckCircle2, X as XIcon } from 'lucide-react';

// Thành phần giao diện dùng lại.
export const Chip = ({ tone = 'neutral', children }) => <span className={`chip chip-${tone}`}>{children}</span>;

export const EXAM_TONE = { DRAFT: 'neutral', PUBLISHED: 'success', CLOSED: 'warning' };
export const Q_TONE = { DRAFT: 'warning', ACTIVE: 'success', ARCHIVED: 'neutral' };
export const USER_TONE = { ACTIVE: 'success', LOCKED: 'danger', DISABLED: 'neutral' };

// ---------- Hộp thoại xác nhận, nhập liệu và thông báo nhanh (thay window.confirm/prompt) ----------

const DialogCtx = createContext(null);
export const useDialog = () => useContext(DialogCtx);

export function DialogProvider({ children }) {
  const [dlg, setDlg] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [text, setText] = useState('');
  const okRef = useRef(null);

  const open = useCallback(cfg => new Promise(resolve => { setText(''); setDlg({ ...cfg, resolve }); }), []);
  const confirm = useCallback(cfg => open({ kind: 'confirm', ...cfg }), [open]);
  const prompt = useCallback(cfg => open({ kind: 'prompt', ...cfg }), [open]);
  const toast = useCallback((message, tone = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(t => [...t, { id, message, tone }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4500);
  }, []);
  const dismiss = useCallback(() => setDlg(d => { d?.resolve(d.kind === 'prompt' ? null : false); return null; }), []);
  const close = value => { dlg.resolve(value); setDlg(null); };

  useEffect(() => {
    if (!dlg) return;
    const onKey = e => { if (e.key === 'Escape') { dlg.resolve(dlg.kind === 'prompt' ? null : false); setDlg(null); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dlg]);

  return <DialogCtx.Provider value={{ confirm, prompt, toast, dismiss }}>
    {children}
    {dlg && <div className="modal-scrim" onMouseDown={e => { if (e.target === e.currentTarget) close(dlg.kind === 'prompt' ? null : false); }}>
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="dlg-title"
        onSubmit={e => { e.preventDefault(); close(dlg.kind === 'prompt' ? text : true); }}>
        <h2 id="dlg-title">{dlg.title}</h2>
        {dlg.message && <p className="muted" style={{ fontSize: 'var(--fs-md)' }}>{dlg.message}</p>}
        {dlg.kind === 'prompt' && <label className="field">{dlg.label}
          <input type={dlg.secret ? 'password' : 'text'} value={text} onChange={e => setText(e.target.value)} autoFocus autoComplete="new-password" required />
        </label>}
        <div className="actions-row modal-actions">
          <button type="button" className="btn btn-secondary" onClick={() => close(dlg.kind === 'prompt' ? null : false)}>Huỷ</button>
          <button ref={okRef} type="submit" autoFocus={dlg.kind === 'confirm'}
            className={dlg.danger ? 'btn btn-primary btn-danger-solid' : 'btn btn-primary'}>{dlg.confirmLabel || 'Đồng ý'}</button>
        </div>
      </form>
    </div>}
    <div className="toasts" aria-live="polite">
      {toasts.map(t => <div key={t.id} className={`toast toast-${t.tone}`}><CheckCircle2 /><span>{t.message}</span>
        <button aria-label="Đóng" onClick={() => setToasts(x => x.filter(y => y.id !== t.id))}><XIcon /></button></div>)}
    </div>
  </DialogCtx.Provider>;
}
