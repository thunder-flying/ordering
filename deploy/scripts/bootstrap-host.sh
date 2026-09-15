#!/usr/bin/env bash
set -euo pipefail
umask 077

if [ "$(id -u)" -ne 0 ]; then
  echo "bootstrap-host must run as root" >&2
  exit 1
fi

. /etc/os-release
if [ "$ID" != "alinux" ] || [ "$VERSION_ID" != "3" ]; then
  echo "unsupported host OS: ${ID:-unknown} ${VERSION_ID:-unknown}" >&2
  exit 1
fi

available_bytes="$(df --output=avail -B1 / | tail -n 1 | tr -d ' ')"
if [ "$available_bytes" -lt 8589934592 ]; then
  echo "root filesystem has less than 8 GiB available" >&2
  exit 1
fi

if firewall-cmd --list-ports 2>/dev/null | grep -Eq '(^| )(3000|3306)/tcp($| )'; then
  echo "refusing to continue while firewall exposes 3000 or 3306" >&2
  exit 1
fi

if ! swapon --show=NAME --noheadings | tr -d ' ' | grep -qx '/swapfile'; then
  if [ -e /swapfile ]; then
    echo "refusing to take ownership of an inactive existing /swapfile" >&2
    exit 1
  fi
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
fi

if ! grep -q '^/swapfile none swap sw 0 0$' /etc/fstab; then
  printf '%s\n' '/swapfile none swap sw 0 0' >> /etc/fstab
fi
printf '%s\n' 'vm.swappiness=10' > /etc/sysctl.d/zz-kaifanla-swap.conf
sysctl --system >/dev/null
sysctl -p /etc/sysctl.d/zz-kaifanla-swap.conf >/dev/null

if ! command -v docker >/dev/null 2>&1; then
  if [ -d /var/lib/docker ] && find /var/lib/docker -mindepth 1 -print -quit | grep -q .; then
    echo "refusing Docker installation because /var/lib/docker is not empty" >&2
    exit 1
  fi

  dnf -y install wget firewalld
  wget -q -O /etc/yum.repos.d/docker-ce.repo http://mirrors.cloud.aliyuncs.com/docker-ce/linux/centos/docker-ce.repo
  sed -i 's|https://mirrors.aliyun.com|http://mirrors.cloud.aliyuncs.com|g' /etc/yum.repos.d/docker-ce.repo
  dnf -y install dnf-plugin-releasever-adapter --repo alinux3-plus
  dnf -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

install -d -m 0755 /etc/docker
if [ -e /etc/docker/daemon.json ]; then
  grep -q '"log-driver"[[:space:]]*:[[:space:]]*"json-file"' /etc/docker/daemon.json
  grep -q '"max-size"[[:space:]]*:[[:space:]]*"10m"' /etc/docker/daemon.json
  grep -q '"max-file"[[:space:]]*:[[:space:]]*"5"' /etc/docker/daemon.json
else
  printf '%s\n' \
    '{' \
    '  "log-driver": "json-file",' \
    '  "log-opts": {' \
    '    "max-size": "10m",' \
    '    "max-file": "5"' \
    '  }' \
    '}' > /etc/docker/daemon.json
  chmod 0644 /etc/docker/daemon.json
fi

systemctl enable --now docker firewalld
systemctl restart docker

firewall-cmd --permanent --add-service=ssh >/dev/null
firewall-cmd --permanent --add-service=http >/dev/null
firewall-cmd --permanent --add-service=https >/dev/null
firewall-cmd --reload >/dev/null
if firewall-cmd --list-ports | grep -Eq '(^| )(3000|3306)/tcp($| )'; then
  echo "firewall unexpectedly exposes 3000 or 3306" >&2
  exit 1
fi

install -d -o root -g root -m 0755 /opt/kaifanla
install -d -o root -g root -m 0700 /opt/kaifanla/images
install -d -o 10001 -g 10001 -m 0750 /var/lib/kaifanla/uploads
install -d -o 10002 -g 10002 -m 0700 /var/backups/kaifanla
install -d -o root -g root -m 0700 /etc/kaifanla
install -d -o root -g root -m 0750 /var/log/kaifanla

docker version >/dev/null
docker compose version >/dev/null
systemctl is-active --quiet docker
systemctl is-active --quiet firewalld

echo "host bootstrap completed"
