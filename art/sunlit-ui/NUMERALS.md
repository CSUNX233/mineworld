# Pixel numeral candidates

Generated with the built-in image generation tool. A: compact HUD; B: bold combat; C: adventure serif. Each atlas has digits 0–4 above 5–9. 10 is composed from 1 and 0. Selection pending; no runtime font replacement yet.

Each digit uses a fixed cell, preserving source alpha and alignment. Tint via a CSS alpha mask or a sprite material color; add a dark outline at render time for contrast. Keep nearest-neighbor sampling.

## A

Generate a production sprite atlas for Sunlit Quest bright adventure pixel game UI. A: Compact upright classic RPG pixel numerals, balanced medium bold strokes, exceptionally readable at small HUD sizes. EXACTLY ten separate digits: upper row 0 1 2 3 4; lower row 5 6 7 8 9. Canvas 1536x1024, regular 5 columns by 2 rows equal cells. Each digit centered within its own cell, consistent baseline and cap height across all digits, generous transparent margins. Strict crisp square pixel art, no antialiasing, no blur, no smooth curves. White monochrome glyphs with at most light gray stepped bevel details, no colored pixels, no black outline, no shadow: tint and dark outline will be applied in game. Genuine transparent alpha background, NOT a checkerboard drawing. Digits only: no titles, grid lines, labels, frames, decorations or other objects. Each digit must be complete and distinct, zero has a clear inner hole. Suitable for both UI values and floating combat damage. All ten digits same scale.

## B

Generate a production sprite atlas for Sunlit Quest bright adventure pixel game UI. B: Bold chunky arcade damage numerals, broad heavy strokes and stepped clipped corners, energetic but upright, strong silhouette. EXACTLY ten separate digits: upper row 0 1 2 3 4; lower row 5 6 7 8 9. Canvas 1536x1024, regular 5 columns by 2 rows equal cells. Each digit centered within its own cell, consistent baseline and cap height across all digits, generous transparent margins. Strict crisp square pixel art, no antialiasing, no blur, no smooth curves. White monochrome glyphs with at most light gray stepped bevel details, no colored pixels, no black outline, no shadow: tint and dark outline will be applied in game. Genuine transparent alpha background, NOT a checkerboard drawing. Digits only: no titles, grid lines, labels, frames, decorations or other objects. Each digit must be complete and distinct, zero has a clear inner hole. Suitable for both UI values and floating combat damage. All ten digits same scale.

## C

Generate a production sprite atlas for Sunlit Quest bright adventure pixel game UI. C: Elegant adventure pixel numerals, slightly narrower tall forms with small angular slab terminals, carved fantasy feeling, still clearly legible. EXACTLY ten separate digits: upper row 0 1 2 3 4; lower row 5 6 7 8 9. Canvas 1536x1024, regular 5 columns by 2 rows equal cells. Each digit centered within its own cell, consistent baseline and cap height across all digits, generous transparent margins. Strict crisp square pixel art, no antialiasing, no blur, no smooth curves. White monochrome glyphs with at most light gray stepped bevel details, no colored pixels, no black outline, no shadow: tint and dark outline will be applied in game. Genuine transparent alpha background, NOT a checkerboard drawing. Digits only: no titles, grid lines, labels, frames, decorations or other objects. Each digit must be complete and distinct, zero has a clear inner hole. Suitable for both UI values and floating combat damage. All ten digits same scale.

Selection: A is now used for damage numbers, C for quantity values. B remains an unused source candidate. Runtime files live under public/assets/ui/sunlit/numerals. Shared crop bounds per set preserve relative baseline and alpha; CSS masks tint via currentColor.
