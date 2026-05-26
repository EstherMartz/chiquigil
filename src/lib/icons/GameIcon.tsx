interface GameIconProps {
  src: string;
  alt: string;
  size?: number;
  decorative?: boolean;
  className?: string;
}

export function GameIcon({ src, alt, size = 16, decorative = false, className }: GameIconProps) {
  return (
    <img
      src={src}
      alt={decorative ? '' : alt}
      width={size}
      height={size}
      loading="lazy"
      className={`inline-block align-[-2px] ${className ?? ''}`}
      style={{ width: size, height: size }}
    />
  );
}
