import {continueRender, delayRender, staticFile} from 'remotion';

const HEB = 'U+0590-05FF, U+200C-2010, U+20AA, U+25CC, U+FB1D-FB4F';
const LAT = 'U+0000-00FF, U+0131, U+0152-0153, U+2000-206F, U+20AC, U+2122, U+2212, U+FEFF';

const faces: [string, string, string, string][] = [
  ['Heebo', 'heebo-hebrew-700-normal.woff2', '700', HEB],
  ['Heebo', 'heebo-hebrew-800-normal.woff2', '800', HEB],
  ['Heebo', 'heebo-hebrew-900-normal.woff2', '900', HEB],
  ['Heebo', 'heebo-latin-700-normal.woff2', '700', LAT],
  ['Heebo', 'heebo-latin-800-normal.woff2', '800', LAT],
  ['Heebo', 'heebo-latin-900-normal.woff2', '900', LAT],
  ['Barlow', 'barlow-condensed-latin-600-normal.woff2', '600', LAT],
  ['Barlow', 'barlow-condensed-latin-700-normal.woff2', '700', LAT],
  ['Barlow', 'barlow-condensed-latin-800-normal.woff2', '800', LAT],
];

let started = false;
export const loadFonts = () => {
  if (started || typeof document === 'undefined') return;
  started = true;
  const handle = delayRender('Loading fonts');
  Promise.all(
    faces.map(([family, file, weight, range]) =>
      new FontFace(family, `url(${staticFile('fonts/' + file)})`, {weight, unicodeRange: range})
        .load()
        .then((f) => (document.fonts as unknown as {add: (f: FontFace) => void}).add(f)),
    ),
  )
    .then(() => continueRender(handle))
    .catch((e) => {
      console.error(e);
      continueRender(handle);
    });
};
