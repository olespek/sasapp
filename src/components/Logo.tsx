import logoSvg from '../assets/logo.svg?raw';

/** Offisiell Sola Airshow-logo. Fargen styres med CSS «color». */
export function Logo({ className = '' }: { className?: string }) {
  return <span className={`logo ${className}`} dangerouslySetInnerHTML={{ __html: logoSvg }} />;
}
