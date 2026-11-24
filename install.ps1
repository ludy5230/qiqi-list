# QiqiList - one-line installer for Windows
#
#   powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/ludy5230/qiqi-list/main/install.ps1 | iex"
#
# Optional: set a target folder before running
#   $env:QIQLIST_DIR = "D:\Apps\QiqiList"
# Optional: force a fresh download even if it is already installed
#   $env:QIQLIST_FORCE = "1"
# Optional: start the app right after installing
#   $env:QIQLIST_LAUNCH = "1"
#
# This script is intentionally ASCII-only so it survives any console code page.
# All Chinese names are built from code points at runtime.

$ErrorActionPreference = 'Stop'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}

$repo    = 'ludy5230/qiqi-list'
$appName = [string]([char]0x67D2 + [char]0x67D2 + [char]0x6E05 + [char]0x5355)   # the app name, built from code points
$exeName = $appName + '.exe'
$lnkName = $appName + '.lnk'
$homeDir = $env:USERPROFILE
$cfgDir  = Join-Path $homeDir '.workbuddy'
$cfgFile = Join-Path $cfgDir 'qiqi-list.json'

function Say($msg) { Write-Host $msg }

# ---------- already installed? ----------
function Find-Existing {
    $probes = @()
    if (Test-Path $cfgFile) {
        try {
            $c = Get-Content -LiteralPath $cfgFile -Raw -Encoding UTF8 | ConvertFrom-Json
            if ($c.installDir) { $probes += $c.installDir }
        } catch {}
    }
    $probes += (Join-Path $homeDir 'QiqiList')
    $probes += 'D:\QiqiList'
    foreach ($d in $probes) {
        if (-not $d) { continue }
        if ((Test-Path (Join-Path $d $exeName)) -or (Test-Path (Join-Path $d 'data\kanban.json'))) { return $d }
    }
    return $null
}

# ---------- pick a folder: D drive first ----------
function Pick-Dir {
    if ($env:QIQLIST_DIR) {
        $d = [IO.Path]::GetFullPath($env:QIQLIST_DIR)
        New-Item -ItemType Directory -Force -Path $d | Out-Null
        return $d
    }
    $cands = @()
    foreach ($drv in @('D:', 'E:', 'F:')) {
        if (Test-Path ($drv + '\')) { $cands += ($drv + '\QiqiList'); break }
    }
    $cands += (Join-Path $homeDir 'QiqiList')
    foreach ($d in $cands) {
        try {
            New-Item -ItemType Directory -Force -Path $d | Out-Null
            $t = Join-Path $d '.write-test'
            Set-Content -LiteralPath $t -Value 'ok' -ErrorAction Stop
            Remove-Item -LiteralPath $t -Force
            return $d
        } catch {}
    }
    throw 'No writable folder found. Set $env:QIQLIST_DIR and run again.'
}

function Make-Shortcut($exe, $workDir) {
    try {
        $desktop = [Environment]::GetFolderPath('Desktop')
        $lnk = Join-Path $desktop $lnkName
        $sh = New-Object -ComObject WScript.Shell
        $s = $sh.CreateShortcut($lnk)
        $s.TargetPath = $exe
        $s.WorkingDirectory = $workDir
        $s.IconLocation = $exe + ',0'
        $s.Description = $appName
        $s.Save()
        return $lnk
    } catch {
        return $null
    }
}

function Write-Cfg($dir, $exe) {
    try {
        New-Item -ItemType Directory -Force -Path $cfgDir | Out-Null
        $cfg = [ordered]@{
            installDir  = $dir
            exe         = $exe
            dataFile    = (Join-Path $dir 'data\kanban.json')
            installedAt = (Get-Date).ToString('o')
            source      = 'https://github.com/' + $repo
        }
        $cfg | ConvertTo-Json | Set-Content -LiteralPath $cfgFile -Encoding UTF8
    } catch {}
}

function Download-File($url, $dest) {
    $req = [Net.HttpWebRequest]::Create($url)
    $req.UserAgent = 'qiqi-list-installer'
    $req.Timeout = 60000
    $res = $req.GetResponse()
    try {
        $total = $res.ContentLength
        $in = $res.GetResponseStream()
        $out = [IO.File]::Create($dest)
        try {
            $buf = New-Object byte[] 262144
            $got = 0
            $last = -10
            while (($n = $in.Read($buf, 0, $buf.Length)) -gt 0) {
                $out.Write($buf, 0, $n)
                $got += $n
                if ($total -gt 0) {
                    $pct = [int]($got * 100 / $total)
                    if ($pct -ge $last + 10) { Say ("  {0}%  ({1:N1} / {2:N1} MB)" -f $pct, ($got/1MB), ($total/1MB)); $last = $pct }
                }
            }
        } finally {
            $out.Close()
            $in.Close()
        }
    } finally {
        $res.Close()
    }
}

# ---------- main ----------
$forceNew = ($env:QIQLIST_FORCE -eq '1')
$found = if ($forceNew) { $null } else { Find-Existing }
if ($found) {
    $exe = Join-Path $found $exeName
    Write-Cfg $found $exe
    Say ('Already installed: ' + $found)
    $appLine = if (Test-Path $exe) { $exe } else { '(exe missing, data kept)' }
    Say ('App    : ' + $appLine)
    Say ('Data   : ' + (Join-Path $found 'data\kanban.json'))
    Say ''
    Say ('Launch it from the desktop shortcut "' + $appName + '", or ask your AI to open it.')
    Say 'To reinstall anyway, set $env:QIQLIST_FORCE = "1" and run again.'
    return
}

$dir = Pick-Dir
Say ('Install dir : ' + $dir)
Say 'Querying the latest release ...'
$rel = Invoke-RestMethod -Uri ('https://api.github.com/repos/' + $repo + '/releases/latest') -UseBasicParsing -Headers @{ 'User-Agent' = 'qiqi-list-installer' }
if (-not $rel -or -not $rel.assets -or $rel.assets.Count -eq 0) {
    throw 'Could not read release info from GitHub.'
}
$asset = $rel.assets | Where-Object { $_.name -like '*.exe' } | Select-Object -First 1
if (-not $asset) { $asset = $rel.assets[0] }
Say ('Latest      : ' + $rel.tag_name + ' / ' + $asset.name + ' / ' + ('{0:N1} MB' -f ($asset.size / 1MB)))
Say 'Downloading (about 110 MB, one or two minutes) ...'

$target = Join-Path $dir $exeName
$tmp = $target + '.part'
if (Test-Path $tmp) { Remove-Item -LiteralPath $tmp -Force }
Download-File $asset.browser_download_url $tmp

$size = (Get-Item -LiteralPath $tmp).Length
if ($size -lt 50MB) { throw ('Downloaded file is only ' + $size + ' bytes, looks incomplete. Try again.') }
Move-Item -LiteralPath $tmp -Destination $target -Force
Say ('Downloaded  : ' + ('{0:N1} MB' -f ($size / 1MB)))

try { Unblock-File -LiteralPath $target -ErrorAction SilentlyContinue } catch {}

$lnk = Make-Shortcut $target $dir
Write-Cfg $dir $target

Say ('Shortcut    : ' + $(if ($lnk) { $lnk } else { 'not created (the app still works)' }))
Say ('Data will be: ' + (Join-Path $dir 'data\kanban.json'))
Say ''
Say 'Done. Everything is in one folder - copy the folder to move it to another PC.'
Say ('Double-click "' + $appName + '" on the desktop to start.')

if ($env:QIQLIST_LAUNCH -eq '1') {
    Start-Process -FilePath $target -WorkingDirectory $dir
    Say 'Started.'
}
