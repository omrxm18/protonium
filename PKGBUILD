# Maintainer: omrxm18 <omrxm18@proton.me>
pkgname=protonmail-desktop
pkgver=0.1.0
pkgrel=1
pkgdesc="Unofficial Electron wrapper for mail.proton.me"
arch=('x86_64')
url="https://github.com/omrxm18/protonmail-desktop"
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
  "https://github.com/omrxm18/protonmail-desktop/releases/download/v${pkgver}/${pkgname}-${pkgver}.tar.gz"
  "protonmail-desktop.desktop"
  "icon.png"
)
sha256sums=(
  'SKIP'
  'acba4c64ea57047b943636c72f97a07f22eec72844a6db38642284657a806390'
  'ac1c1410a42699e4711c68249e0560a169e1aad1fcf992ec9e4ea411e4480130'
)

package() {
  local instdir="$pkgdir/opt/protonmail-desktop"
  install -dm755 "$instdir"
  cp -r "$srcdir"/* "$instdir"/ || true
  rm -f "$instdir/protonmail-desktop.desktop" "$instdir/icon.png"

  chmod 4755 "$instdir/chrome-sandbox" || true

  install -dm755 "$pkgdir/usr/bin"
  cat > "$pkgdir/usr/bin/protonmail-desktop" <<'EOF'
#!/bin/sh
exec /opt/protonmail-desktop/protonmail-desktop "$@"
EOF
  chmod 755 "$pkgdir/usr/bin/protonmail-desktop"

  install -Dm644 "$srcdir/protonmail-desktop.desktop" \
    "$pkgdir/usr/share/applications/protonmail-desktop.desktop"

  install -Dm644 "$srcdir/icon.png" \
    "$pkgdir/usr/share/icons/hicolor/64x64/apps/protonmail-desktop.png"
}
