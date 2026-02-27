export function RenAvatar({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" className={className} style={style}>
      <style>{`
        @keyframes ren-float {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-3px); }
        }
        @keyframes ren-blink {
          0%, 87%, 100% { transform: scaleY(1); }
          91%, 95%      { transform: scaleY(0.07); }
        }
        .ren-body { animation: ren-float 6s ease-in-out infinite; }
        .ren-eyes {
          animation: ren-blink 5s ease-in-out 3s infinite;
          transform-box: fill-box;
          transform-origin: center;
        }
      `}</style>

      {/* Outer ring */}
      <circle cx="60" cy="60" r="58" fill="#eff6ff" stroke="#60A5FA" strokeWidth="2" />

      <g className="ren-body">
        {/* Hair (back) — dark navy, short */}
        <ellipse cx="60" cy="46" rx="33" ry="26" fill="#1e3a5f" />

        {/* Head / face */}
        <ellipse cx="60" cy="71" rx="28" ry="31" fill="#fde8d8" />

        {/* Ears */}
        <ellipse cx="32" cy="71" rx="5" ry="7" fill="#fde8d8" />
        <ellipse cx="88" cy="71" rx="5" ry="7" fill="#fde8d8" />

        {/* Hair front — swept to the left */}
        <path d="M30,50 Q33,22 60,19 Q84,23 90,48 Q82,34 60,34 Q38,34 30,50Z" fill="#1e40af" />
        {/* Side sweep left */}
        <path d="M30,50 Q20,58 24,72 Q28,62 34,55Z" fill="#1e40af" />
        {/* Right side flush */}
        <path d="M90,48 Q96,56 92,68 Q90,59 86,54Z" fill="#1e40af" />
        {/* Front sweep across forehead */}
        <path d="M36,38 Q48,30 60,34 Q46,32 38,40Z" fill="#2563eb" />

        {/* Eyebrows — straight, composed */}
        <path d="M37,59 Q44,56 51,59" stroke="#1e3a5f" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <path d="M69,59 Q76,56 83,59" stroke="#1e3a5f" strokeWidth="2.5" fill="none" strokeLinecap="round" />

        {/* Eyes — calm, slightly narrower */}
        <g className="ren-eyes">
          {/* Left eye */}
          <ellipse cx="44" cy="68" rx="8.5" ry="8" fill="#0f172a" />
          <ellipse cx="44" cy="68" rx="6.5" ry="6.5" fill="#3b82f6" />
          <ellipse cx="44" cy="69" rx="4" ry="4.5" fill="#1d4ed8" />
          <circle cx="40.5" cy="64.5" r="2.5" fill="white" opacity="0.9" />
          <circle cx="47.5" cy="70" r="1.1" fill="white" opacity="0.6" />
          {/* Right eye */}
          <ellipse cx="76" cy="68" rx="8.5" ry="8" fill="#0f172a" />
          <ellipse cx="76" cy="68" rx="6.5" ry="6.5" fill="#3b82f6" />
          <ellipse cx="76" cy="69" rx="4" ry="4.5" fill="#1d4ed8" />
          <circle cx="72.5" cy="64.5" r="2.5" fill="white" opacity="0.9" />
          <circle cx="79.5" cy="70" r="1.1" fill="white" opacity="0.6" />
          {/* Lash lines */}
          <path d="M35.5,61 Q44,58.5 52.5,61" stroke="#0f172a" strokeWidth="1.8" fill="none" strokeLinecap="round" />
          <path d="M67.5,61 Q76,58.5 84.5,61" stroke="#0f172a" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        </g>

        {/* Nose */}
        <ellipse cx="60" cy="80" rx="2" ry="1.4" fill="#d9856a" opacity="0.45" />

        {/* Subtle composed mouth */}
        <path d="M53,89 Q60,93 67,89" stroke="#c06060" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  )
}
