#!/bin/sh
set -eu
cost_plugin_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
cost_desktop_cli='/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh'
if [ ! -d "$cost_plugin_dir/node_modules/zod" ]; then
  (cd "$cost_plugin_dir" && npm ci --omit=dev --ignore-scripts)
fi
if [ -x "$cost_desktop_cli" ]; then
  "$cost_desktop_cli" plugin --profile "${1:-desktop}" add "$cost_plugin_dir"
else
  dsh plugin --profile "${1:-web}" add "$cost_plugin_dir"
fi
printf '%s\n' '安装完成；如果回复下方未出现费用，请重新打开 Harness。'
