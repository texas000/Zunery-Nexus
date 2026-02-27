export function KiraAvatar({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" className={className} style={style}>
      <style>{`
        @keyframes kira-float {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-4px); }
        }
        @keyframes kira-blink {
          0%, 89%, 100% { transform: scaleY(1); }
          92%, 96%      { transform: scaleY(0.07); }
        }
        @keyframes kira-glow {
          0%, 100% { opacity: 0.7; }
          50%       { opacity: 1; }
        }
        .kira-body { animation: kira-float 4.5s ease-in-out infinite; }
        .kira-eyes {
          animation: kira-blink 5s ease-in-out 4s infinite;
          transform-box: fill-box;
          transform-origin: center;
        }
        .kira-streak { animation: kira-glow 3s ease-in-out infinite; }
      `}</style>

      {/* Outer ring */}
      <circle cx="60" cy="60" r="58" fill="#f0fdf4" stroke="#34D399" strokeWidth="2" />

      <g className="kira-body">
        {/* Hair (back) — dark, slightly spiky */}
        <ellipse cx="60" cy="46" rx="33" ry="25" fill="#1c1c2e" />
        {/* Spiky top */}
        <path d="M44,30 Q50,16 56,28 Q58,18 62,28 Q68,14 74,28 Q70,20 60,19 Q50,20 44,30Z" fill="#1c1c2e" />

        {/* Head / face */}
        <ellipse cx="60" cy="71" rx="28" ry="31" fill="#fde8d8" />

        {/* Ears */}
        <ellipse cx="32" cy="71" rx="5" ry="7" fill="#fde8d8" />
        <ellipse cx="88" cy="71" rx="5" ry="7" fill="#fde8d8" />

        {/* Hair front */}
        <path d="M30,50 Q33,22 60,19 Q87,22 90,50 Q83,35 60,35 Q37,35 30,50Z" fill="#2d2d42" />
        {/* Asymmetric bangs */}
        <path d="M30,50 Q26,62 30,74 Q33,63 38,56Z" fill="#2d2d42" />
        {/* Green highlight streak on left side */}
        <path d="M32,46 Q29,58 32,70 Q33,59 36,52Z" fill="#34D399" className="kira-streak" />

        {/* Glasses */}
        <rect x="33" y="62" width="20" height="13" rx="4" ry="4" fill="none" stroke="#4ade80" strokeWidth="1.8" />
        <rect x="67" y="62" width="20" height="13" rx="4" ry="4" fill="none" stroke="#4ade80" strokeWidth="1.8" />
        {/* Glasses bridge */}
        <path d="M53,68 L67,68" stroke="#4ade80" strokeWidth="1.8" />
        {/* Glasses left ear piece */}
        <path d="M33,68 L26,67" stroke="#4ade80" strokeWidth="1.5" strokeLinecap="round" />
        {/* Glasses right ear piece */}
        <path d="M87,68 L94,67" stroke="#4ade80" strokeWidth="1.5" strokeLinecap="round" />
        {/* Lens glint */}
        <path d="M36,65 L40,65" stroke="white" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
        <path d="M70,65 L74,65" stroke="white" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />

        {/* Eyebrows — sharp, angular */}
        <path d="M37,58 Q44,54 51,58" stroke="#1c1c2e" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <path d="M69,58 Q76,54 83,58" stroke="#1c1c2e" strokeWidth="2.5" fill="none" strokeLinecap="round" />

        {/* Eyes — sharp and focused */}
        <g className="kira-eyes">
          {/* Left eye */}
          <ellipse cx="43" cy="68" rx="7.5" ry="7" fill="#0a1a0a" />
          <ellipse cx="43" cy="68" rx="5.5" ry="5.5" fill="#059669" />
          <ellipse cx="43" cy="68.5" rx="3.5" ry="4" fill="#065f46" />
          <circle cx="40" cy="64.5" r="2.2" fill="white" opacity="0.9" />
          <circle cx="46.5" cy="70" r="1" fill="white" opacity="0.6" />
          {/* Right eye */}
          <ellipse cx="77" cy="68" rx="7.5" ry="7" fill="#0a1a0a" />
          <ellipse cx="77" cy="68" rx="5.5" ry="5.5" fill="#059669" />
          <ellipse cx="77" cy="68.5" rx="3.5" ry="4" fill="#065f46" />
          <circle cx="74" cy="64.5" r="2.2" fill="white" opacity="0.9" />
          <circle cx="80.5" cy="70" r="1" fill="white" opacity="0.6" />
          {/* Lash lines */}
          <path d="M35.5,61.5 Q43,59 50.5,61.5" stroke="#0a1a0a" strokeWidth="1.8" fill="none" strokeLinecap="round" />
          <path d="M69.5,61.5 Q77,59 84.5,61.5" stroke="#0a1a0a" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        </g>

        {/* Nose */}
        <ellipse cx="60" cy="80" rx="2" ry="1.4" fill="#d9856a" opacity="0.45" />

        {/* Focused / slight smirk */}
        <path d="M53,89 Q60,93 67,89" stroke="#b06060" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        {/* Slight upward left corner */}
        <path d="M53,89 Q51,87 52,85" stroke="#b06060" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  )
}
