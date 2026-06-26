$devtools = "D:\superai\微信web开发者工具\cli.bat"
$project = Split-Path -Parent $MyInvocation.MyCommand.Path

& $devtools open --project $project --lang zh --disable-gpu
