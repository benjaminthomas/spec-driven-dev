#!/usr/bin/env bash
# Installs spec-driven-dev's Agent Skills (https://agentskills.io) into a host's
# skills directory. Claude Code users don't need this — install via the plugin
# marketplace instead (see README.md). This script is for Codex CLI, Cursor,
# Antigravity, or any other Agent-Skills-compatible host.
#
# Usage:
#   ./install.sh                              interactive: pick a host and skills
#   ./install.sh <host> [skill ...]            install into the project (cwd)
#   ./install.sh --global <host> [skill ...]   install into the host's global dir
#   ./install.sh --mirror                      maintainer-only: (re)create the
#                                               repo's own .agents/skills/ symlinks
#
# Hosts: codex, cursor, antigravity
# Skills default to all seven when none are named:
#   spec-investigate spec-create spec-implement spec-verify spec-checkpoint spec-ship generative-seo

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILLS_SRC="$SCRIPT_DIR/skills"
ALL_SKILLS=(spec-investigate spec-create spec-implement spec-verify spec-checkpoint spec-ship generative-seo)

usage() {
  sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'
}

dest_dir() {
  local host="$1" scope="$2"
  case "$host" in
    codex)
      if [ "$scope" = global ]; then echo "$HOME/.codex/skills"; else echo ".agents/skills"; fi
      ;;
    cursor)
      if [ "$scope" = global ]; then echo "$HOME/.cursor/skills"; else echo ".cursor/skills"; fi
      ;;
    antigravity)
      if [ "$scope" = global ]; then echo "$HOME/.gemini/config/skills"; else echo ".agents/skills"; fi
      ;;
    *)
      echo "Unknown host: $host (expected codex, cursor, or antigravity)" >&2
      exit 1
      ;;
  esac
}

detect_hosts() {
  local found=()
  [ -d "$HOME/.codex" ] && found+=(codex)
  [ -d "$HOME/.cursor" ] && found+=(cursor)
  [ -d "$HOME/.gemini" ] && found+=(antigravity)
  printf '%s\n' "${found[@]}"
}

validate_skill() {
  local skill="$1"
  for s in "${ALL_SKILLS[@]}"; do
    [ "$s" = "$skill" ] && return 0
  done
  echo "Unknown skill: $skill (expected one of: ${ALL_SKILLS[*]})" >&2
  exit 1
}

install_skills() {
  local host="$1" scope="$2"; shift 2
  local skills=("$@")
  local dest
  dest="$(dest_dir "$host" "$scope")"

  mkdir -p "$dest"
  for skill in "${skills[@]}"; do
    validate_skill "$skill"
    rm -rf "$dest/$skill"
    cp -r "$SKILLS_SRC/$skill" "$dest/$skill"
    echo "Installed $skill -> $dest/$skill"
  done
  echo
  echo "Done. $host discovers skills at: $dest"
}

mirror_repo_skills() {
  local mirror_dir="$SCRIPT_DIR/.agents/skills"
  mkdir -p "$mirror_dir"
  for skill in "${ALL_SKILLS[@]}"; do
    ln -sfn "../../skills/$skill" "$mirror_dir/$skill"
    echo "Linked .agents/skills/$skill -> ../../skills/$skill"
  done
  echo
  echo "Mirror up to date. Re-run this after adding/removing/renaming a skill folder."
  echo "Note: this mirror is symlinks, so it only survives a git clone, not a ZIP download."
}

interactive_install() {
  if [ ! -t 0 ]; then
    echo "No host specified and no interactive terminal available." >&2
    usage >&2
    exit 1
  fi

  local detected
  mapfile -t detected < <(detect_hosts)

  echo "spec-driven-dev skill installer"
  echo
  if [ "${#detected[@]}" -gt 0 ]; then
    echo "Detected host config on this machine: ${detected[*]}"
  else
    echo "No known host config directories detected (~/.codex, ~/.cursor, ~/.gemini)."
  fi
  echo
  read -rp "Install for which host? (codex/cursor/antigravity): " host
  read -rp "Project-level (this directory) or global? [project/global]: " scope_in
  local scope="project"
  [ "$scope_in" = "global" ] && scope="global"
  read -rp "Which skills? (comma-separated, blank = all): " skills_in

  local skills=()
  if [ -z "$skills_in" ]; then
    skills=("${ALL_SKILLS[@]}")
  else
    IFS=',' read -ra skills <<< "$skills_in"
    for i in "${!skills[@]}"; do skills[$i]="$(echo "${skills[$i]}" | xargs)"; done
  fi

  install_skills "$host" "$scope" "${skills[@]}"
}

main() {
  if [ "${1:-}" = "--mirror" ]; then
    mirror_repo_skills
    exit 0
  fi

  if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
    usage
    exit 0
  fi

  local scope="project"
  if [ "${1:-}" = "--global" ]; then
    scope="global"
    shift
  fi

  if [ "$#" -eq 0 ]; then
    interactive_install
    exit 0
  fi

  local host="$1"; shift
  local skills=("$@")
  if [ "${#skills[@]}" -eq 0 ]; then
    skills=("${ALL_SKILLS[@]}")
  fi

  install_skills "$host" "$scope" "${skills[@]}"
}

main "$@"
