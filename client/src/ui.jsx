// Thành phần giao diện dùng lại.
export const Chip = ({ tone = 'neutral', children }) => <span className={`chip chip-${tone}`}>{children}</span>;

export const EXAM_TONE = { DRAFT: 'neutral', PUBLISHED: 'success', CLOSED: 'warning' };
export const Q_TONE = { DRAFT: 'warning', ACTIVE: 'success', ARCHIVED: 'neutral' };
export const USER_TONE = { ACTIVE: 'success', LOCKED: 'danger', DISABLED: 'neutral' };
