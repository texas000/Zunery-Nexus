export function YukiAvatar({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" className={className} style={style}>
      <style>{`
        @keyframes yuki-float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          33%       { transform: translateY(-3px) rotate(0.4deg); }
          66%       { transform: translateY(-2px) rotate(-0.3deg); }
        }
        @keyframes yuki-blink {
          0%, 82%, 100% { transform: scaleY(1); }
          86%, 90%      { transform: scaleY(0.07); }
        }
        @keyframes yuki-sparkle {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(0.6); }
        }
        .yuki-body { animation: yuki-float 6.5s ease-in-out infinite; }
        .yuki-eyes {
          animation: yuki-blink 5.5s ease-in-out 0.8s infinite;
          transform-box: fill-box;
          transform-origin: center;
        }
        .yuki-sparkle { animation: yuki-sparkle 2.5s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
      `}</style>

      {/* Outer ring */}
      <circle cx="60" cy="60" r="58" fill="#f5f3ff" stroke="#A78BFA" strokeWidth="2" />

      <g className="yuki-body">
        {/* Long hair (back) — silver-lavender */}
        <ellipse cx="60" cy="48" rx="34" ry="30" fill="#c4b5fd" />
        {/* Hair flowing down sides */}
        <path d="M26,58 Q18,80 22,108 Q30,90 33,72Z" fill="#c4b5fd" />
        <path d="M94,58 Q102,80 98,108 Q90,90 87,72Z" fill="#c4b5fd" />

        {/* Head / face */}
        <ellipse cx="60" cy="72" rx="29" ry="32" fill="#fde8d8" />

        {/* Ears */}
        <ellipse cx="31" cy="72" rx="5" ry="7" fill="#fde8d8" />
        <ellipse cx="89" cy="72" rx="5" ry="7" fill="#fde8d8" />

        {/* Hair front — long soft bangs */}
        <path d="M29,52 Q32,22 60,19 Q88,22 91,52 Q84,36 60,36 Q36,36 29,52Z" fill="#ddd6fe" />
        {/* Parted center bang */}
        <path d="M52,36 Q56,44 55,52 Q52,44 48,42Z" fill="#a78bfa" opacity="0.7" />
        <path d="M68,36 Q64,44 65,52 Q68,44 72,42Z" fill="#a78bfa" opacity="0.7" />

        {/* Star hair clip */}
        <g className="yuki-sparkle" transform="translate(80, 38)">
          <polygon points="0,-6 1.8,-2 6,-2 2.7,1.2 4,5.8 0,3.2 -4,5.8 -2.7,1.2 -6,-2 -1.8,-2"
            fill="#fbbf24" stroke="#f59e0b" strokeWidth="0.5" />
        </g>

        {/* Eyebrows — soft, gently arched */}
        <path d="M37,58 Q44,53 51,57" stroke="#7c3aed" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <path d="M69,57 Q76,53 83,58" stroke="#7c3aed" strokeWidth="1.8" fill="none" strokeLinecap="round" />

        {/* Eyes — wide and dreamy */}
        <g className="yuki-eyes">
          {/* Left eye */}
          <ellipse cx="44" cy="67" rx="9.5" ry="11" fill="#1a0a2e" />
          <ellipse cx="44" cy="67" rx="7.5" ry="9" fill="#7c3aed" />
          <ellipse cx="44" cy="68" rx="5" ry="6.5" fill="#5b21b6" />
          <circle cx="40" cy="63" r="3" fill="white" opacity="0.9" />
          <circle cx="48" cy="70" r="1.3" fill="white" opacity="0.6" />
          {/* Little sparkle inside eye */}
          <circle cx="47.5" cy="63.5" r="1.2" fill="white" opacity="0.5" />
          {/* Right eye */}
          <ellipse cx="76" cy="67" rx="9.5" ry="11" fill="#1a0a2e" />
          <ellipse cx="76" cy="67" rx="7.5" ry="9" fill="#7c3aed" />
          <ellipse cx="76" cy="68" rx="5" ry="6.5" fill="#5b21b6" />
          <circle cx="72" cy="63" r="3" fill="white" opacity="0.9" />
          <circle cx="80" cy="70" r="1.3" fill="white" opacity="0.6" />
          <circle cx="79.5" cy="63.5" r="1.2" fill="white" opacity="0.5" />
          {/* Lash lines */}
          <path d="M34.5,59 Q44,56 53.5,59" stroke="#1a0a2e" strokeWidth="1.8" fill="none" strokeLinecap="round" />
          <path d="M66.5,59 Q76,56 85.5,59" stroke="#1a0a2e" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        </g>

        {/* Nose */}
        <ellipse cx="60" cy="80" rx="2" ry="1.4" fill="#d9856a" opacity="0.45" />

        {/* Soft thoughtful smile */}
        <path d="M52,89 Q60,96 68,89" stroke="#b06080" strokeWidth="1.8" fill="none" strokeLinecap="round" />

        {/* Light blush */}
        <ellipse cx="34" cy="80" rx="9" ry="5" fill="#A78BFA" opacity="0.18" />
        <ellipse cx="86" cy="80" rx="9" ry="5" fill="#A78BFA" opacity="0.18" />
      </g>
    </svg>
  )
}
