# Protonium

an unofficial mail client for proton mail

## reasons to use it

I don't recommend using it, it's not a good idea

## features

none, it's just a window mostly just mail.proton.me in it

## Downloads

if you desire:
- [My Downloads](https://dl.x01.dpdns.org/protonium)
- [GitHub releases](https://github.com/omrxm18/protonium/releases)

## how to build

if you want semi-dumb-explained instuctions, see the [Wiki](https://wiki.x01.dpdns.org/en/protonium/HOW-TO-BUILD)

build-all:
```bash
npm run dist
```

Arch Linux:
```bash
npm run build-arch
```

if you don't want the heavy building of all other formats, you can specify yours directly:
```bash
npm run dist -- -l <option>

available options:
  deb  build for debian
  rpm  build for fedora/redhat, etc..
  dir  the unpacked app at release/*-unpacked
  AppImage  build the .AppImage (usable anywhere)
```
