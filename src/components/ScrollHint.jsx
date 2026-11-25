import { useEffect, useState } from 'react';

// Grossa freccia dorata verso il basso con la scritta "scroll", che pulsa. Si vede solo in cima alla pagina:
// appena si scende sfuma via, se si torna su ricompare. (Fuori dalla cinematica: va dentro <SiteOnly>.)
export default function ScrollHint() {
  const [top, setTop] = useState(true);
  useEffect(() => {
    const on = () => setTop(window.scrollY < window.innerHeight * 0.08);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  return (
    <div className={`scroll-hint${top ? '' : ' is-away'}`} aria-hidden="true">
      <div className="scroll-hint-pulse">
        <svg viewBox="0 0 64 64" className="scroll-hint-arrow">
          <path d="M32 8v42M14 33l18 18 18-18" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="scroll-hint-label">scroll</span>
      </div>
    </div>
  );
}
