import cv2
import numpy as np

img = cv2.imread('scratch_wa_preview.jpg')
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
h, w = gray.shape

# Paper background is around 180-210, ink is < 115
_, thresh = cv2.threshold(gray, 115, 255, cv2.THRESH_BINARY_INV)

num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(thresh)

squares = []
for i in range(1, num_labels):
    area = stats[i, cv2.CC_STAT_AREA]
    bw = stats[i, cv2.CC_STAT_WIDTH]
    bh = stats[i, cv2.CC_STAT_HEIGHT]
    cx, cy = centroids[i]
    aspect = bw / bh if bh > 0 else 0
    fill = area / (bw * bh) if bw * bh > 0 else 0
    
    if 6 <= bw <= 30 and 6 <= bh <= 30 and 0.6 <= aspect <= 1.6 and fill > 0.6:
        squares.append((cx, cy, bw, bh))

print(f"Total square candidates found: {len(squares)}")

# Cluster by X
squares.sort(key=lambda s: s[0])
clusters = []
for s in squares:
    added = False
    for cl in clusters:
        if abs(cl['mean_x'] - s[0]) < 25:
            cl['items'].append(s)
            cl['mean_x'] = sum(x[0] for x in cl['items']) / len(cl['items'])
            added = True
            break
    if not added:
        clusters.append({'mean_x': s[0], 'items': [s]})

big_clusters = [cl for cl in clusters if len(cl['items']) >= 12]
print(f"Big clusters found: {len(big_clusters)}")
for cl in big_clusters:
    ys = [s[1] for s in cl['items']]
    print(f"Track X={cl['mean_x']:.1f}, count={len(cl['items'])}, minY={min(ys):.1f}, maxY={max(ys):.1f}")
