Option Explicit
Dim shell,folder
Set shell=CreateObject("Shell.Application")
Set folder=shell.BrowseForFolder(0,"Chon THU MUC SHOP DANG DUNG (co START_SHOP.bat va data). Khong chon thu muc ban cap nhat.", &H1 Or &H10,0)
If folder Is Nothing Then WScript.Quit 1
WScript.Echo folder.Self.Path
