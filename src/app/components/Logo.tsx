interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizeMap = {
  sm: { width: 16, height: 28, strokeWidth: 2 },
  md: { width: 24, height: 42, strokeWidth: 2.5 },
  lg: { width: 32, height: 56, strokeWidth: 3.5 },
  xl: { width: 48, height: 84, strokeWidth: 5 },
};

export function Logo({ size = "md", className = "" }: LogoProps) {
  const { width, height, strokeWidth } = sizeMap[size];

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 32 56"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M8 0 Q12 28, 8 56"
        stroke="url(#logo-gradient)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M24 0 Q28 28, 24 56"
        stroke="url(#logo-gradient)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        fill="none"
      />
      <defs>
        <linearGradient
          id="logo-gradient"
          x1="16"
          y1="0"
          x2="16"
          y2="56"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#0d9488" />
        </linearGradient>
      </defs>
    </svg>
  );
}
