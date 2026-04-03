/**
 * A curated list of popular Google Fonts for the certificate generator.
 * These are loaded dynamically when selected to maintain performance.
 */
export const POPULAR_GOOGLE_FONTS = [
  'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Oswald', 'Source Sans Pro', 'Slabo 27px',
  'Raleway', 'PT Sans', 'Merriweather', 'Noto Sans', 'Playfair Display', 'Lora', 'Muli',
  'Nunito', 'Arimo', 'Poppins', 'Titillium Web', 'PT Serif', 'Roboto Mono', 'Ubuntu',
  'Oxygen', 'Inconsolata', 'Fira Sans', 'Dancing Script', 'Pacifico', 'Quicksand',
  'Josefin Sans', 'Libre Baskerville', 'Anton', 'Abril Fatface', 'Crimson Text',
  'Lobster', 'Comfortaa', 'Exo 2', 'Teko', 'Kanit', 'Caveat', 'Shadows Into Light',
  'Great Vibes', 'Zilla Slab', 'Amatic SC', 'Bebas Neue', 'Cinzel', 'Spectral',
  'Inter', 'Work Sans', 'Karla', 'Rubik', 'IBM Plex Sans', 'Manrope', 'Mukta',
  'Nunito Sans', 'DM Sans', 'Outfit', 'Space Grotesk', 'Plus Jakarta Sans',
  'Playfair Display SC', 'Cookie', 'Sacramento', 'Yellowtail', 'Courgette',
  'Kaushan Script', 'Sofia', 'Allura', 'Satisfy', 'Pinyon Script', 'Rochester',
  'Old Standard TT', 'Cardo', 'Vollkorn', 'EBGaramond', 'Cormorant Garamond',
  'Crimson Pro', 'Prata', 'Playball', 'Tangerine', 'Italianno', 'Parisienne',
  'Alex Brush', 'Mrs Saint Delafield', 'Homemade Apple', 'Reenie Beanie',
  'Nothing You Could Do', 'Bad Script', 'Calligraffitti', 'Gloria Hallelujah',
  'Indie Flower', 'Architects Daughter', 'Patrick Hand', 'Permanent Marker',
  'Rock Salt', 'Special Elite', 'Arizonia', 'Berkshire Swash', 'Ceviche One',
  'Chonburi', 'Fondamento', 'Glass Antiqua', 'Grenze Gotisch', 'Kalam',
  'Kurale', 'Maitree', 'Mali', 'Marcellus', 'Metamorphous', 'Milonga',
  'Modak', 'Modern Antiqua', 'Molle', 'Montserrat Alternates', 'Mountains of Christmas',
  'Mystery Quest', 'Niconne', 'Nokora', 'Nosifer', 'Nova Mono', 'Nova Round',
  'Nova Script', 'Nova Slim', 'NTR', 'Numans', 'Nuniton', 'Odibee Sans',
  'Offside', 'Oi', 'Oldenburg', 'Oleo Script', 'Open Sans Condensed',
  'Oranienbaum', 'Orbitron', 'Oregano', 'Orienta', 'Original Surfer',
  'Overlock', 'Overpass', 'Ovo', 'Oxanium', 'Oya', 'Palanquin', 'Pangolin',
  'Paprika', 'Passero One', 'Passion One', 'Passions Conflict', 'Pathway Gothic One',
  'Patua One', 'Pavanam', 'Paytone One', 'Peddana', 'Peralta', 'Petit Formal Script',
  'Petrona', 'Philosopher', 'Phudu', 'Piedra', 'Pinaki', 'Pinyon Script',
  'Pirata One', 'Plaster', 'Play', 'Playfair Display', 'Podkova', 'Poiret One',
  'Poller One', 'Poly', 'Pompiere', 'Pontano Sans', 'Poor Story', 'Port Lligat Sans',
  'Port Lligat Slab', 'Potta One', 'Pragati Narrow', 'Preahvihear', 'Press Start 2P',
  'Pridi', 'Princess Sofia', 'Prociono', 'Prompt', 'Prosto One', 'Proza Libre',
  'Public Sans', 'Puritan', 'Purple Purse', 'Qahiri', 'Quando', 'Quantico',
  'Quattrocento', 'Quattrocento Sans', 'Questrial', 'Quicksand', 'Quintessential',
  'Qwigley', 'Racing Sans One', 'Radley', 'Rajdhani', 'Rakkas', 'Raleway',
  'Raleway Dots', 'Ramabhadra', 'Ramaraja', 'Rambla', 'Ramneeto', 'Ranchers',
  'Rancho', 'Ranga', 'Rasa', 'Rationale', 'Ravi Prakash', 'Red Hat Display',
  'Red Hat Text', 'Red Rose', 'Reem Kufi', 'Reenie Beanie', 'Revalia', 'Rhodium Libre',
  'Ribeye', 'Ribeye Marrow', 'Righteous', 'Risque', 'Rix', 'Road Rage',
  'Robert', 'Rochester', 'Rock Salt', 'Rokkitt', 'Romanesco', 'Ropa Sans',
  'Rosario', 'Rosarivo', 'Rouge Script', 'Rowdies', 'Rozha One', 'Rubik',
  'Rubik Beastly', 'Rubik Mono One', 'Ruda', 'Rufina', 'Ruge Boogie', 'Ruluko',
  'Rum Raisin', 'Ruslan Display', 'Russo One', 'Ruthie', 'Ruy', 'Rye',
];

export const GOOGLE_FONT_WEIGHTS = [
  { label: 'Thin',       value: 100 },
  { label: 'Extra Light', value: 200 },
  { label: 'Light',      value: 300 },
  { label: 'Regular',    value: 400 },
  { label: 'Medium',     value: 500 },
  { label: 'Semi Bold',  value: 600 },
  { label: 'Bold',       value: 700 },
  { label: 'Extra Bold', value: 800 },
  { label: 'Black',      value: 900 },
];

/**
 * Dynamically loads a Google Font by injecting a <link> tag.
 */
export function loadGoogleFont(family: string, weight: number = 400) {
  if (typeof window === 'undefined') return;
  
  const id = `google-font-${family.replace(/\s+/g, '-').toLowerCase()}-${weight}`;
  if (document.getElementById(id)) return;

  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${family.replace(/\s+/g, '+')}:wght@${weight}&display=swap`;
  document.head.appendChild(link);
}

/**
 * Fetches the raw font file bytes for use in PDF generation.
 * Parses Google's CSS API to find the actual .ttf/.woff2 URL.
 */
export async function fetchGoogleFontBytes(family: string, weight: number = 400): Promise<ArrayBuffer | null> {
  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=${family.replace(/\s+/g, '+')}:wght@${weight}`;
    const response = await fetch(cssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36'
      }
    });
    const cssText = await response.text();

    // Regex to find the first src: url(...) in the CSS
    const match = cssText.match(/src:\s*url\(([^)]+)\)/);
    if (!match || !match[1]) return null;

    const fontUrl = match[1].replace(/['"]/g, '');
    const fontResponse = await fetch(fontUrl);
    return await fontResponse.arrayBuffer();
  } catch (e) {
    console.error(`Failed to fetch bytes for Google Font: ${family}`, e);
    return null;
  }
}
