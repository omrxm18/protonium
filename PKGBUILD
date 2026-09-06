# Maintainer: omrxm18 <omrxm18@proton.me>
pkgname=protonium
pkgver=0.1.0
pkgrel=1
pkgdesc="Unofficial Electron wrapper for mail.proton.me"
arch=('x86_64')
url="https://github.com/omrxm18/protonium"
license=('Apache2')
depends=(
  'gtk3'
  'nss'
  'alsa-lib'
  'libxss'
  'libnotify'
  'libappindicator-gtk3'
  'at-spi2-core'
  'libxtst'
  'nspr'
)
provides=("${pkgname}")
conflicts=("${pkgname}")

source=(
  "https://github.com/omrxm18/protonium/releases/download/v${pkgver}/${pkgname}-${pkgver}.tar.gz"
  "protonium.desktop"
  "icon.png"
)
sha256sums=(
  'SKIP'
  '1bb4c0c43753d1a9adead191d0f4c2d9856453eee99614e662969269d9a42551'
  '2f2b5b123cdc065bc42562eee7aa6fbaf1787f02271cf7d2b00e3bac65b6742e'
)

package() {
  local instdir="$pkgdir/opt/protonium"
  install -dm755 "$instdir"
  cp -r "$srcdir"/* "$instdir"/ || true
  rm -f "$instdir/protonium.desktop" "$instdir/icon.png"

  chmod 4755 "$instdir/chrome-sandbox" || true

  install -dm755 "$pkgdir/usr/bin"
  cat > "$pkgdir/usr/bin/protonium" <<'EOF'
#!/bin/sh
exec /opt/protonium/protonium "$@"
EOF
  chmod 755 "$pkgdir/usr/bin/protonium"

  install -Dm644 "$srcdir/protonium.desktop" \
    "$pkgdir/usr/share/applications/protonium.desktop"

  install -Dm644 "$srcdir/icon.png" \
    "$pkgdir/usr/share/icons/hicolor/64x64/apps/protonium.png"
}
