/** Shared offset-bar brand mark, reconstructed from the supplied Écartéo identity. */
export function BrandMark({ inverted = false, size = 32 }: { inverted?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <path
        d="M17 3h19v5.6H17zM5 8.6h20v5.6H5zM17 25.4h19V31H17zM5 31h20v5.6H5z"
        fill={inverted ? '#FFFFFF' : '#181B52'}
      />
      <path d="M17 14.2h15v5.6H17zM9 19.8h13v5.6H9z" fill="#27D4D7" />
    </svg>
  );
}
