export function HanaAvatar({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" className={className} style={style}>
      <style>{`
        @keyframes hana-float {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-4px); }
        }
        @keyframes hana-blink {
          0%, 84%, 100% { transform: scaleY(1); }
          88%, 93%      { transform: scaleY(0.07); }
        }
        .hana-body { animation: hana-float 5s ease-in-out infinite; }
        .hana-eyes {
          animation: hana-blink 4.5s ease-in-out 1.5s infinite;
          transform-box: fill-box;
          transform-origin: center;
        }
      `}</style>

      {/* Outer ring */}
      <circle cx="60" cy="60" r="58" fill="#fdf2f8" stroke="#F472B6" strokeWidth="2" />

      <g className="hana-body">
        {/* Hair (back) */}
        <ellipse cx="60" cy="48" rx="34" ry="29" fill="#f9a8d4" />
        {/* Twin-tail right */}
        <path d="M87,76 Q100,92 94,110 Q86,98 84,86Z" fill="#f9a8d4" />
        {/* Twin-tail left */}
        <path d="M33,76 Q20,92 26,110 Q34,98 36,86Z" fill="#f9a8d4" />

        {/* Head / face */}
        <ellipse cx="60" cy="72" rx="29" ry="32" fill="#fde8d8" />

        {/* Ears */}
        <ellipse cx="31" cy="72" rx="5" ry="7" fill="#fde8d8" />
        <ellipse cx="89" cy="72" rx="5" ry="7" fill="#fde8d8" />

        {/* Hair front / bangs */}
        <path d="M29,52 Q32,22 60,19 Q88,22 91,52 Q84,36 60,36 Q36,36 29,52Z" fill="#fb7185" />
        {/* Left side-bang */}
        <path d="M30,52 Q24,67 28,82 Q31,70 36,60Z" fill="#fb7185" />
        {/* Right side-bang */}
        <path d="M90,52 Q96,67 92,82 Q89,70 84,60Z" fill="#fb7185" />
        {/* Ahoge */}
        <path d="M60,19 Q67,5 63,0 Q61,9 60,19Z" fill="#fb7185" />
        <path d="M60,19 Q53,7 57,2 Q60,11 60,19Z" fill="#f9a8d4" />

        {/* Eyebrows */}
        <path d="M37,58 Q44,54 51,58" stroke="#be185d" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M69,58 Q76,54 83,58" stroke="#be185d" strokeWidth="2" fill="none" strokeLinecap="round" />

        {/* Eyes — animated blink */}
        <g className="hana-eyes">
          {/* Left eye */}
          <ellipse cx="44" cy="67" rx="9" ry="10" fill="#1a0026" />
          <ellipse cx="44" cy="67" rx="7" ry="8.5" fill="#ec4899" />
          <ellipse cx="44" cy="68" rx="4.5" ry="5.5" fill="#9d174d" />
          <circle cx="40.5" cy="63" r="2.8" fill="white" opacity="0.9" />
          <circle cx="47.5" cy="69.5" r="1.2" fill="white" opacity="0.6" />
          {/* Right eye */}
          <ellipse cx="76" cy="67" rx="9" ry="10" fill="#1a0026" />
          <ellipse cx="76" cy="67" rx="7" ry="8.5" fill="#ec4899" />
          <ellipse cx="76" cy="68" rx="4.5" ry="5.5" fill="#9d174d" />
          <circle cx="72.5" cy="63" r="2.8" fill="white" opacity="0.9" />
          <circle cx="79.5" cy="69.5" r="1.2" fill="white" opacity="0.6" />
          {/* Lash lines */}
          <path d="M35,60 Q44,57 53,60" stroke="#1a0026" strokeWidth="1.8" fill="none" strokeLinecap="round" />
          <path d="M67,60 Q76,57 85,60" stroke="#1a0026" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        </g>

        {/* Nose */}
        <ellipse cx="60" cy="80" rx="2" ry="1.4" fill="#d9856a" opacity="0.5" />

        {/* Smile */}
        <path d="M51,89 Q60,98 69,89" stroke="#c2545a" strokeWidth="2" fill="none" strokeLinecap="round" />

        {/* Blush */}
        <ellipse cx="34" cy="80" rx="9" ry="5" fill="#F472B6" opacity="0.22" />
        <ellipse cx="86" cy="80" rx="9" ry="5" fill="#F472B6" opacity="0.22" />
      </g>
    </svg>
  )
}
