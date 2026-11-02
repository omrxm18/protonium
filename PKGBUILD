# Maintainer: omrxm18 <omrxm18@proton.me>
pkgname=protonium-git
pkgver=0.2.0.r7.gedc5c8e
pkgrel=1
pkgdesc="Unofficial Electron wrapper for mail.proton.me"
arch=('x86_64')
url="https://git.x01.dpdns.org/protonium"
license=('Apache-2.0')
depends=(
  'alsa-lib' 'at-spi2-core' 'cairo' 'dbus' 'expat' 'glib2' 'glibc'
  'gtk3' 'hicolor-icon-theme' 'libcups' 'libgcc' 'libx11' 'libxcb'
  'libxcomposite' 'libxdamage' 'libxext' 'libxfixes' 'libxkbcommon'
  'libxrandr' 'mesa' 'nspr' 'nss' 'pango' 'systemd-libs'
  'libxss' 'libnotify' 'libxtst' 'libappindicator-gtk3'
  'libsecret' 'xdg-utils'
)
makedepends=('git' 'nodejs' 'npm')

provides=("protonium=${pkgver}" "protonium-bin")
conflicts=("protonium" "protonium-bin")
options=('!strip' '!debug')

source=(
  "git+https://git.x01.dpdns.org/protonium.git"
  "protonium.desktop"
  "icon.png"
)
sha256sums=(
  'SKIP'
  '1bb4c0c43753d1a9adead191d0f4c2d9856453eee99614e662969269d9a42551'
  '2f2b5b123cdc065bc42562eee7aa6fbaf1787f02271cf7d2b00e3bac65b6742e'
)

pkgver() {
  cd "$srcdir/protonium"
  git describe --long --tags 2>/dev/null | sed 's/^v//;s/\([^-]*-g\)/r\1/;s/-/./g' \
    || printf "r%s.%s" "$(git rev-list --count HEAD)" "$(git rev-parse --short HEAD)"
}

build() {
  cd "$srcdir/protonium"
  export npm_config_cache="$srcdir/npm-cache"
  export npm_config_loglevel=error
  export npm_config_audit=false
  export npm_config_fund=false
  export npm_config_progress=false

  npm ci
  npm run --silent prepare-arch
}

package() {
  local instdir="$pkgdir/opt/protonium"
  install -dm755 "$instdir"
  cp -a "$srcdir/protonium/release/linux-unpacked/." "$instdir/"
  rm -f "$instdir/protonium.desktop" "$instdir/icon.png"

  chmod 4755 "$instdir/chrome-sandbox"

  install -dm755 "$pkgdir/usr/bin"
  ln -s /opt/protonium/protonium "$pkgdir/usr/bin/protonium"

  install -Dm644 "$srcdir/protonium.desktop" \
    "$pkgdir/usr/share/applications/protonium.desktop"
  install -Dm644 "$srcdir/icon.png" \
    "$pkgdir/usr/share/icons/hicolor/64x64/apps/protonium.png"
  install -Dm644 "$srcdir/protonium/LICENSE" \
    "$pkgdir/usr/share/licenses/$pkgname/LICENSE"
}
