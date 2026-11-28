// Linh vật "Sổ Cái": cuốn sổ có mặt cười. mood: happy | cheer | oops
export default function Mascot({ mood = 'happy', size = 96 }) {
  const mouth = {
    happy: <path d="M38 62 Q50 72 62 62" />,
    cheer: <path d="M36 60 Q50 80 64 60 Z" fill="#fff" />,
    oops: <path d="M40 68 Q50 60 60 68" />
  }[mood];
  return <svg className={`mascot mascot-${mood}`} width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="Linh vật Sổ Cái">
    <rect x="20" y="14" width="64" height="76" rx="9" fill="#003f79" />
    <rect x="16" y="10" width="64" height="76" rx="9" fill="#00529c" />
    <rect x="16" y="10" width="10" height="76" rx="5" fill="#0a74c9" />
    <rect x="34" y="18" width="38" height="6" rx="3" fill="#ffb800" />
    <ellipse cx="42" cy="46" rx="5" ry={mood === 'oops' ? 4 : 6} fill="#fff" />
    <ellipse cx="62" cy="46" rx="5" ry={mood === 'oops' ? 4 : 6} fill="#fff" />
    <circle cx="43" cy="47" r="2.4" fill="#172b40" />
    <circle cx="63" cy="47" r="2.4" fill="#172b40" />
    <g fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">{mouth}</g>
    <circle cx="33" cy="58" r="4" fill="#ff8aa0" opacity=".55" />
    <circle cx="71" cy="58" r="4" fill="#ff8aa0" opacity=".55" />
  </svg>;
}
