#!/usr/bin/env bash

set -Eeuo pipefail

readonly APP_NAME="Dynamic Island"
readonly UUID="dynamic-island@xuanhong"
readonly DEFAULT_REPO_URL="https://github.com/kimxuanhong/dynamic-island-linux.git"
readonly DEFAULT_REPO_REF="main"
readonly MIN_GO_VERSION="1.23"

REPO_URL="${DYNAMIC_ISLAND_REPO_URL:-$DEFAULT_REPO_URL}"
REPO_REF="${DYNAMIC_ISLAND_REPO_REF:-$DEFAULT_REPO_REF}"
DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
BIN_HOME="$HOME/.local/bin"
SOURCE_DIR="$DATA_HOME/dynamic-island/source"
SERVICE_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
BUILD_DIR=""

info() {
    printf '\033[1;34m==>\033[0m %s\n' "$*"
}

success() {
    printf '\033[1;32m✓\033[0m %s\n' "$*"
}

warn() {
    printf '\033[1;33m!\033[0m %s\n' "$*" >&2
}

die() {
    printf '\033[1;31mError:\033[0m %s\n' "$*" >&2
    exit 1
}

cleanup() {
    if [[ -n "$BUILD_DIR" && -d "$BUILD_DIR" ]]; then
        rm -rf -- "$BUILD_DIR"
    fi
}

trap cleanup EXIT
trap 'die "Cài đặt thất bại tại dòng $LINENO. Hãy xem thông báo ngay phía trên."' ERR

if [[ ${EUID:-$(id -u)} -eq 0 ]]; then
    die "Không chạy installer bằng root. Hãy chạy bằng tài khoản GNOME hiện tại; script sẽ tự gọi sudo khi cần."
fi

for command in uname mkdir mktemp install cp rm; do
    command -v "$command" >/dev/null 2>&1 || die "Thiếu lệnh bắt buộc: $command"
done

install_dependencies() {
    local missing=()
    local command
    for command in git curl tar gzip zip sha256sum glib-compile-schemas; do
        command -v "$command" >/dev/null 2>&1 || missing+=("$command")
    done

    if ((${#missing[@]} == 0)); then
        success "Các công cụ build cơ bản đã sẵn sàng"
        return
    fi

    info "Cài dependency còn thiếu: ${missing[*]}"
    command -v sudo >/dev/null 2>&1 || die "Cần sudo để cài dependency hệ thống"

    if command -v apt-get >/dev/null 2>&1; then
        sudo apt-get update
        sudo apt-get install -y git curl ca-certificates tar gzip zip coreutils libglib2.0-bin
    elif command -v dnf >/dev/null 2>&1; then
        sudo dnf install -y git curl ca-certificates tar gzip zip coreutils glib2
    elif command -v pacman >/dev/null 2>&1; then
        sudo pacman -S --needed --noconfirm git curl ca-certificates tar gzip zip coreutils glib2
    elif command -v zypper >/dev/null 2>&1; then
        sudo zypper --non-interactive install git curl ca-certificates tar gzip zip coreutils glib2-tools
    else
        die "Không nhận diện được trình quản lý gói. Hãy cài thủ công: git curl tar gzip zip coreutils glib2"
    fi

    for command in git curl tar gzip zip sha256sum glib-compile-schemas; do
        command -v "$command" >/dev/null 2>&1 || die "Không cài được dependency: $command"
    done
}

version_at_least() {
    local current="$1"
    local required="$2"
    [[ "$(printf '%s\n%s\n' "$required" "$current" | sort -V | head -n1)" == "$required" ]]
}

install_go() {
    local current_version=""
    if command -v go >/dev/null 2>&1; then
        current_version="$(go env GOVERSION 2>/dev/null || true)"
        current_version="${current_version#go}"
    fi

    if [[ -n "$current_version" ]] && version_at_least "$current_version" "$MIN_GO_VERSION"; then
        success "Go $current_version đã sẵn sàng"
        return
    fi

    local machine go_arch version_payload go_version archive_url expected actual go_root
    machine="$(uname -m)"
    case "$machine" in
        x86_64) go_arch="amd64" ;;
        aarch64|arm64) go_arch="arm64" ;;
        armv6l|armv7l) go_arch="armv6l" ;;
        i386|i686) go_arch="386" ;;
        *) die "Go chưa hỗ trợ kiến trúc được installer nhận diện: $machine" ;;
    esac

    info "Tìm phiên bản Go ổn định mới nhất"
    version_payload="$(curl -fsSL --retry 3 https://go.dev/VERSION?m=text)"
    go_version="${version_payload%%$'\n'*}"
    [[ "$go_version" == go* ]] || die "Không lấy được phiên bản Go từ go.dev"

    archive_url="https://go.dev/dl/${go_version}.linux-${go_arch}.tar.gz"
    info "Tải ${go_version} cho linux-${go_arch}"
    curl -fL --retry 3 --progress-bar "$archive_url" -o "$BUILD_DIR/go.tar.gz"
    expected="$(curl -fsSL --retry 3 "${archive_url}.sha256")"
    actual="$(sha256sum "$BUILD_DIR/go.tar.gz" | awk '{print $1}')"
    [[ "$actual" == "$expected" ]] || die "Checksum Go không hợp lệ"

    go_root="$DATA_HOME/dynamic-island/go/$go_version"
    if [[ ! -x "$go_root/bin/go" ]]; then
        mkdir -p "$go_root"
        tar -xzf "$BUILD_DIR/go.tar.gz" -C "$go_root" --strip-components=1
    fi

    mkdir -p "$BIN_HOME"
    ln -sfn "$go_root/bin/go" "$BIN_HOME/go"
    ln -sfn "$go_root/bin/gofmt" "$BIN_HOME/gofmt"
    export PATH="$BIN_HOME:$PATH"
    success "Đã cài $go_version tại $go_root"
}

check_gnome() {
    command -v gnome-shell >/dev/null 2>&1 || die "Không tìm thấy GNOME Shell"
    command -v gnome-extensions >/dev/null 2>&1 || die "Không tìm thấy lệnh gnome-extensions"
    command -v systemctl >/dev/null 2>&1 || die "Không tìm thấy systemd"

    local shell_output shell_version shell_major
    shell_output="$(gnome-shell --version)"
    shell_version="$(awk '{print $NF}' <<<"$shell_output")"
    shell_major="${shell_version%%.*}"
    [[ "$shell_major" =~ ^[0-9]+$ ]] || die "Không đọc được phiên bản GNOME Shell: $shell_output"

    if ((shell_major < 48 || shell_major > 51)); then
        die "$APP_NAME chỉ hỗ trợ GNOME Shell 48, 49, 50 và 51; máy này đang chạy $shell_version"
    fi
    success "Phát hiện GNOME Shell $shell_version"
}

clone_source() {
    if [[ -n "${DYNAMIC_ISLAND_SOURCE_DIR:-}" ]]; then
        SOURCE_DIR="$(cd "$DYNAMIC_ISLAND_SOURCE_DIR" && pwd)"
        [[ -f "$SOURCE_DIR/extension.js" && -f "$SOURCE_DIR/server/go.mod" ]] || \
            die "Source không hợp lệ: $SOURCE_DIR"
        success "Dùng source cục bộ: $SOURCE_DIR"
        return
    fi

    mkdir -p "$(dirname "$SOURCE_DIR")"
    if [[ -d "$SOURCE_DIR/.git" ]]; then
        info "Cập nhật source hiện có"
        git -C "$SOURCE_DIR" fetch --depth 1 origin "$REPO_REF"
        git -C "$SOURCE_DIR" checkout "$REPO_REF"
        git -C "$SOURCE_DIR" merge --ff-only "origin/$REPO_REF"
    elif [[ -e "$SOURCE_DIR" ]]; then
        die "$SOURCE_DIR đã tồn tại nhưng không phải Git repository. Hãy đổi tên thư mục đó rồi chạy lại."
    else
        info "Clone $REPO_URL"
        git clone --depth 1 --branch "$REPO_REF" "$REPO_URL" "$SOURCE_DIR"
    fi
    success "Source: $SOURCE_DIR"
}

build_and_install_server() {
    info "Build Go backend"
    (
        cd "$SOURCE_DIR/server"
        go build -trimpath -ldflags='-s -w' -o "$BUILD_DIR/dynamic-island-server" .
    )

    mkdir -p "$BIN_HOME" "$SERVICE_DIR"
    # Replace the executable atomically, including when the old server is running.
    local staged_binary
    staged_binary="$(mktemp "$BIN_HOME/.dynamic-island-server.XXXXXX")"
    install -m 0755 "$BUILD_DIR/dynamic-island-server" "$staged_binary"
    mv -f "$staged_binary" "$BIN_HOME/dynamic-island-server"
    install -m 0644 "$SOURCE_DIR/server/dynamic-island-server.service" \
        "$SERVICE_DIR/dynamic-island-server.service"

    systemctl --user daemon-reload
    systemctl --user enable --now dynamic-island-server.service
    systemctl --user restart dynamic-island-server.service
    systemctl --user is-active --quiet dynamic-island-server.service || \
        die "Backend không khởi động được. Kiểm tra: journalctl --user -u dynamic-island-server.service"
    success "Backend đã được build và chạy bằng systemd user"
}

build_and_install_extension() {
    local stage="$BUILD_DIR/extension"
    local package="$BUILD_DIR/${UUID}.shell-extension.zip"
    mkdir -p "$stage"

    info "Build GNOME Shell extension"
    install -m 0644 "$SOURCE_DIR/extension.js" "$SOURCE_DIR/prefs.js" \
        "$SOURCE_DIR/metadata.json" "$SOURCE_DIR/stylesheet.css" "$stage/"
    cp -a "$SOURCE_DIR/controllers" "$SOURCE_DIR/models" "$SOURCE_DIR/utils" \
        "$SOURCE_DIR/views" "$SOURCE_DIR/schemas" "$SOURCE_DIR/icons" "$stage/"
    glib-compile-schemas --strict "$stage/schemas"
    (cd "$stage" && zip -qr "$package" .)

    gnome-extensions disable "$UUID" >/dev/null 2>&1 || true
    gnome-extensions install --force "$package"

    local enabled=false
    local attempt
    for attempt in 1 2 3; do
        if gnome-extensions enable "$UUID" >/dev/null 2>&1; then
            enabled=true
            break
        fi
        sleep 1
    done

    if [[ "$enabled" != true ]]; then
        warn "Extension đã được cài nhưng GNOME Shell chưa nạp ngay. Hãy đăng xuất/đăng nhập rồi chạy:"
        warn "gnome-extensions enable $UUID"
    else
        success "Extension đã được cài và bật"
    fi
}

main() {
    printf '\n\033[1m%s — One-command installer\033[0m\n\n' "$APP_NAME"
    install_dependencies
    BUILD_DIR="$(mktemp -d "${TMPDIR:-/tmp}/dynamic-island.XXXXXX")"
    install_go
    check_gnome
    clone_source
    build_and_install_server
    build_and_install_extension

    printf '\n\033[1;32mCài đặt hoàn tất.\033[0m\n'
    printf 'Backend: systemctl --user status dynamic-island-server.service\n'
    printf 'Extension: gnome-extensions info %s\n' "$UUID"
    printf 'Nếu giao diện chưa xuất hiện, hãy đăng xuất rồi đăng nhập lại một lần.\n\n'
}

main "$@"
