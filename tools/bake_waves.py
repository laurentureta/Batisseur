# Rend le champ périodique par troncature spectrale, le ré-échantillonne, calcule les pentes
# exactes dans l'espace de Fourier, et écrit une bande PNG (une image par instant).
import numpy as np
from PIL import Image
OUT='/tmp/claude-0/-home-claude/6baab4ca-b4e9-5e2d-81e3-8a84e6acd45b/scratchpad/wout'
NS, NT = 96, 64          # résolution spatiale et nombre d'instants en sortie
KMAX, FMAX = 32, 24      # troncature spatiale et temporelle

H=np.load(f'{OUT}/H.npy').astype(np.float64)
F,N,_=H.shape
H-=H.mean()
S=np.fft.fftn(H)/ (F*N*N)

fs=np.fft.fftfreq(F)*F
ks=np.fft.fftfreq(N)*N
# spectre de sortie
S2=np.zeros((NT,NS,NS), complex)
fo=np.fft.fftfreq(NT)*NT
ko=np.fft.fftfreq(NS)*NS
idxf={int(v):i for i,v in enumerate(fo)}
idxk={int(v):i for i,v in enumerate(ko)}
kept=0
for ti,fv in enumerate(fs):
    if abs(fv)>FMAX: continue
    tj=idxf.get(int(fv))
    if tj is None: continue
    for zi,zv in enumerate(ks):
        if abs(zv)>KMAX: continue
        zj=idxk.get(int(zv))
        if zj is None: continue
        for xi,xv in enumerate(ks):
            if abs(xv)>KMAX: continue
            xj=idxk.get(int(xv))
            if xj is None: continue
            S2[tj,zj,xj]=S[ti,zi,xi]; kept+=1
print('coefficients conservés', kept)

# hauteur et pentes exactes : dérivée = i*k dans Fourier (k en cycles par période)
KZ=(np.fft.fftfreq(NS)*NS)[None,:,None]
KX=(np.fft.fftfreq(NS)*NS)[None,None,:]
twoPi=2*np.pi
Hf=np.fft.ifftn(S2).real*(NT*NS*NS)
Gx=np.fft.ifftn(S2*(1j*twoPi*KX)).real*(NT*NS*NS)
Gz=np.fft.ifftn(S2*(1j*twoPi*KZ)).real*(NT*NS*NS)
Lap=np.fft.ifftn(S2*(-(twoPi**2)*(KX**2+KZ**2))).real*(NT*NS*NS)
print('H', Hf.min(), Hf.max(), Hf.std(), ' (source std', H.std(), ')')
for nm,A in (('Gx',Gx),('Gz',Gz),('Lap',Lap)):
    print(nm, A.min(), A.max(), A.std())

def pack(A, p=99.7):
    s=np.percentile(np.abs(A), p)
    return np.clip(A/s*0.5+0.5, 0, 1), s
Rh, sh = pack(Hf); Gg, sgx = pack(Gx); Bb, sgz = pack(Gz)
# L'alpha reste à 1 : un canevas HTML stocke les couleurs pré-multipliées, et toute valeur
# d'alpha inférieure à 1 abîmerait le rouge, le vert et le bleu à la relecture.
Aa=np.ones_like(Rh)
img=np.stack([Rh,Gg,Bb,Aa], -1)                       # (NT, NS, NS, 4)
sl=0.0
px=(img*255+0.5).astype(np.uint8)
# atlas carré : 8 x 8 blocs de 96 x 96, pour rester sous la taille de canevas d'iOS
COLS=8
ROWS=NT//COLS
atlas=np.zeros((ROWS*NS, COLS*NS, 4), np.uint8)
for f in range(NT):
    r, c = divmod(f, COLS)
    atlas[r*NS:(r+1)*NS, c*NS:(c+1)*NS] = px[f]
Image.fromarray(atlas, 'RGBA').save(f'{OUT}/waves.png', optimize=True)
import os; print('png', os.path.getsize(f'{OUT}/waves.png'), 'octets', atlas.shape, 'blocs', COLS, 'x', ROWS)
print('échelles  h=%.4f gx=%.4f gz=%.4f lap=%.4f' % (sh,sgx,sgz,sl))
# erreur de quantification sur la pente
err=np.abs((Gg*2-1)*sgx-Gx).mean()
print('erreur moyenne pente %.4f pour un écart-type de %.4f' % (err, Gx.std()))
