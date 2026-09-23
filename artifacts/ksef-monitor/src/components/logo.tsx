/**
 * Wordmark „spendly." — wspólny komponent zamiast czterech niezależnych kopii
 * (marketing-shell.tsx navbar+stopka, home.tsx własny Wordmark, legal-layout.tsx).
 *
 * SVG z prawdziwym liternictwem (audyt brandingowy 2026-09, dostarczone przez
 * usera: Claude outputs/spendly-logo-wordmark*.svg — wygenerowane w osobnej
 * sesji przy tworzeniu contentu na Instagram, ta sama geometria liter jak
 * spendly-logo-icon.svg/favicon.svg). Dwa kolory jako osobne <g>: "spend" =
 * textColor, "ly." = accentColor — sprawdzone przez porównanie wariantu
 * jasnego i ciemnego: identyczna geometria ścieżek, różnią się tylko fill.
 *
 * Kolory przyjmowane jako propsy (nie CSS-owy `.wm`/`.dot`), bo stron
 * marketingowych używa DWÓCH różnych podejść do stylowania — home.tsx klas
 * CSS, /cennik i reszta stylów inline (patrz lib/pricing.ts, komentarz o
 * "stylowanie NIE jest ujednolicone"). Działa w obu: home.tsx podaje
 * `var(--acc-text)`/`var(--text)` jako zwykłe stringi koloru.
 */
export function Logo({
  size = 18,
  accentColor,
  textColor,
}: {
  /** Wysokość renderowanego SVG w px (odpowiednik dawnego fontSize). */
  size?: number;
  accentColor: string;
  textColor: string;
}) {
  // viewBox 1267.4 x 360 (~3.52:1) — wysokość SVG lekko większa od dawnego
  // fontSize tekstowego wordmarku, bo kropka i "y" wychodzą pod linię bazową.
  const height = size * 1.15;
  const width = height * (1267.4 / 360);

  return (
    <svg
      viewBox="0 0 1267.4 360.0"
      width={width}
      height={height}
      role="img"
      aria-label="spendly."
      style={{ display: "block" }}
    >
      <g fill={textColor} transform="translate(40.00,266.75) scale(0.30706,-0.30706)">
        <path d="M279 -13Q210 -13 151.5 0.5Q93 14 58.0 43.5Q23 73 23 122Q23 165 49.0 193.0Q75 221 118 221Q145 221 172.5 212.5Q200 204 231.0 196.0Q262 188 298 188Q330 188 341.0 191.5Q352 195 352 205Q352 217 338.5 221.0Q325 225 293 231L221 245Q176 254 133.5 268.5Q91 283 63.5 312.0Q36 341 36 391Q36 459 96.5 497.0Q157 535 272 535Q338 535 390.5 522.0Q443 509 474.0 483.5Q505 458 505 420Q506 379 483.0 354.0Q460 329 425 329Q400 329 374.5 335.5Q349 342 319.5 349.5Q290 357 252 358Q225 360 208.0 355.0Q191 350 191 339Q191 327 211.0 322.5Q231 318 271 311L342 298Q407 287 445.5 270.5Q484 254 501.0 225.0Q518 196 518 145Q518 92 487.5 56.5Q457 21 403.0 4.0Q349 -13 279 -13Z" transform="translate(0.000,0)" />
        <path d="M381 0Q326 0 289.5 34.0Q253 68 243 122H225V-108Q225 -149 202.0 -177.5Q179 -206 132 -206Q87 -206 62.5 -177.5Q38 -149 38 -106V268Q38 318 34.5 352.5Q31 387 28 415Q24 457 45.0 486.5Q66 516 113 522Q174 530 199.5 500.5Q225 471 225 409V361L229 360Q234 399 252.5 436.5Q271 474 305.0 498.5Q339 523 391 523Q478 523 520.5 453.5Q563 384 563 268Q563 0 381 0ZM221 270Q221 254 225 245Q231 226 250.5 217.5Q270 209 309 209Q359 209 377.5 224.0Q396 239 396 270Q396 302 378.0 316.5Q360 331 310 331Q270 331 250.5 322.5Q231 314 225 295Q221 286 221 270Z" transform="translate(540.000,0)" />
        <path d="M23 260Q23 339 54.5 399.0Q86 459 144.5 493.0Q203 527 284 527Q347 527 397.5 504.0Q448 481 477.0 442.5Q506 404 506 358Q506 310 478.0 290.0Q450 270 395 270H185Q185 244 205.5 227.0Q226 210 275 210Q300 210 321.5 215.0Q343 220 365.5 224.5Q388 229 416 229Q456 229 482.0 200.5Q508 172 508 122Q508 63 447.5 30.0Q387 -3 289 -3Q220 -3 159.5 24.0Q99 51 61.0 109.5Q23 168 23 260ZM347 303Q362 303 357 317Q353 331 333.0 346.0Q313 361 275 361Q231 361 209.5 342.0Q188 323 188 303Z" transform="translate(1126.000,0)" />
        <path d="M124 0Q80 0 53.5 26.5Q27 53 27 92V423Q27 465 52.0 494.0Q77 523 124 523Q170 523 194.0 494.0Q218 465 218 421V371H236Q236 428 256.5 461.0Q277 494 309.0 508.5Q341 523 373 523Q450 523 486.0 467.5Q522 412 522 310V92Q522 53 496.0 26.5Q470 0 426 0Q381 0 354.5 26.5Q328 53 328 92V269Q328 305 314.5 325.0Q301 345 275 345Q245 345 231.5 323.0Q218 301 218 267V92Q218 53 193.0 26.5Q168 0 124 0Z" transform="translate(1652.000,0)" />
        <path d="M205 0Q23 0 23 268Q23 384 68.0 453.5Q113 523 203 523Q252 523 282.5 503.0Q313 483 330.5 448.5Q348 414 356 369L359 370V673Q359 714 383.5 742.5Q408 771 455 771Q501 771 523.5 742.5Q546 714 546 671V221Q546 187 551.5 158.5Q557 130 560 102Q563 64 544.5 36.5Q526 9 479 1Q418 -9 388.5 22.0Q359 53 359 114V151H340Q340 78 303.5 39.0Q267 0 205 0ZM190 277Q190 246 209.0 231.0Q228 216 277 216Q327 216 346.0 231.0Q365 246 365 277Q365 309 346.5 323.5Q328 338 278 338Q228 338 209.0 323.5Q190 309 190 277Z" transform="translate(2199.000,0)" />
      </g>
      <g fill={accentColor} transform="translate(40.00,266.75) scale(0.30706,-0.30706)">
        <path d="M121 0Q72 0 47.5 26.0Q23 52 23 91V671Q23 714 47.5 742.5Q72 771 121 771Q165 771 189.0 742.5Q213 714 213 673V91Q213 52 189.0 26.0Q165 0 121 0Z" transform="translate(2780.000,0)" />
        <path d="M221 -206Q154 -206 111.5 -184.0Q69 -162 45 -126Q25 -95 22.5 -61.0Q20 -27 35.0 2.5Q50 32 80 48Q111 65 142.0 61.5Q173 58 199.0 38.5Q225 19 239 -12Q254 -45 269.5 -60.5Q285 -76 310 -67Q334 -59 327.5 -23.0Q321 13 301 62H264Q221 62 178.0 93.0Q135 124 106 191L24 381Q5 426 20.5 464.0Q36 502 77 519Q115 536 152.0 521.0Q189 506 210 457L286 280Q305 237 327.5 218.0Q350 199 375 212Q397 224 399.0 245.5Q401 267 378 298Q368 312 354.5 329.0Q341 346 330.5 368.5Q320 391 320 419Q320 466 352.0 496.5Q384 527 436 527Q483 527 511.5 497.0Q540 467 540 419Q540 385 532.0 344.0Q524 303 514 268L442 5Q426 -54 400.0 -102.0Q374 -150 331.0 -178.0Q288 -206 221 -206Z" transform="translate(3016.000,0)" />
        <path d="M150 -19Q91 -19 58.0 12.5Q25 44 25 96Q25 149 59.0 182.0Q93 215 150 215Q206 215 239.5 182.5Q273 150 273 97Q273 45 241.0 13.0Q209 -19 150 -19Z" transform="translate(3570.000,0)" />
      </g>
    </svg>
  );
}
