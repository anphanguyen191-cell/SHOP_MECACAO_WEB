// Source-only Windows bridge. No PowerShell, Python, shell commands or inventory writes.
using System;
using System.IO;
using System.Text;
using System.Threading;
using System.Runtime.InteropServices;
using System.ComponentModel;

class ClipboardFiles {
 [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr CreateWindowEx(uint ex,string cls,string name,uint style,int x,int y,int w,int h,IntPtr parent,IntPtr menu,IntPtr instance,IntPtr param);
 [DllImport("user32.dll")] static extern bool DestroyWindow(IntPtr h);
 [DllImport("user32.dll", SetLastError=true)] static extern bool OpenClipboard(IntPtr h);
 [DllImport("user32.dll")] static extern bool CloseClipboard();
 [DllImport("user32.dll", SetLastError=true)] static extern bool EmptyClipboard();
 [DllImport("user32.dll", SetLastError=true)] static extern IntPtr SetClipboardData(uint format,IntPtr data);
 [DllImport("user32.dll")] static extern IntPtr GetClipboardData(uint format);
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern uint RegisterClipboardFormat(string name);
 [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr GlobalAlloc(uint flags,UIntPtr bytes);
 [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr GlobalLock(IntPtr h);
 [DllImport("kernel32.dll")] static extern bool GlobalUnlock(IntPtr h);
 [DllImport("kernel32.dll")] static extern IntPtr GlobalFree(IntPtr h);
 [DllImport("shell32.dll", CharSet=CharSet.Unicode)] static extern uint DragQueryFile(IntPtr h,uint index,StringBuilder name,uint chars);
 static IntPtr Memory(byte[] bytes) {
  IntPtr h=GlobalAlloc(2,(UIntPtr)bytes.Length);if(h==IntPtr.Zero)throw new Win32Exception();
  IntPtr p=GlobalLock(h);if(p==IntPtr.Zero){GlobalFree(h);throw new Win32Exception();}
  Marshal.Copy(bytes,0,p,bytes.Length);GlobalUnlock(h);return h;
 }
 static byte[] DropFiles(string[] files){
  // DROPFILES is 20 bytes on both x86/x64; fWide = TRUE, followed by UTF-16 paths.
  byte[] names=Encoding.Unicode.GetBytes(String.Join("\0",files)+"\0\0");
  byte[] bytes=new byte[20+names.Length];BitConverter.GetBytes(20).CopyTo(bytes,0);BitConverter.GetBytes(1).CopyTo(bytes,16);names.CopyTo(bytes,20);return bytes;
 }
 static void Verify(IntPtr h,string[] files){
  if(DragQueryFile(h,UInt32.MaxValue,null,0)!=files.Length)throw new Exception("Clipboard file count mismatch");
  for(uint i=0;i<files.Length;i++){var s=new StringBuilder(32768);DragQueryFile(h,i,s,(uint)s.Capacity);if(s.ToString()!=files[i])throw new Exception("Clipboard file order/path mismatch");}
 }
 [STAThread] static int Main(string[] args){
  Console.InputEncoding=new UTF8Encoding(false);Console.OutputEncoding=new UTF8Encoding(false);
  IntPtr window=IntPtr.Zero,drop=IntPtr.Zero,effect=IntPtr.Zero;bool opened=false;
  try{
   if(args.Length==1&&args[0]=="--self-test"){
    string[] sample={@"C:\Kho Mẹ CaCao\Bộ gái\Size 1\001.jpg",@"C:\Kho Mẹ CaCao\Bộ gái\Size 2\002.png"};
    drop=Memory(DropFiles(sample));Verify(drop,sample);Console.WriteLine("NATIVE_CLIPBOARD_FORMAT PASS: Unicode multi-file paths, count and order; no clipboard modified");return 0;
   }
   var list=new System.Collections.Generic.List<string>();string line;
   while((line=Console.ReadLine())!=null){if(!File.Exists(line)||!Path.IsPathRooted(line))throw new Exception("File no longer exists");list.Add(line);if(list.Count>100)throw new Exception("Too many files");}
   if(list.Count==0)throw new Exception("No files");string[] files=list.ToArray();
   drop=Memory(DropFiles(files));effect=Memory(BitConverter.GetBytes(1)); // DROPEFFECT_COPY, never CUT.
   window=CreateWindowEx(0,"STATIC","MeCaCao Clipboard",0,0,0,0,0,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero);
   if(window==IntPtr.Zero)throw new Win32Exception();
   for(int attempt=0;attempt<20&&!opened;attempt++){opened=OpenClipboard(window);if(!opened)Thread.Sleep(50);}
   if(!opened)throw new Exception("Clipboard busy; try again");
   if(!(args.Length==1&&args[0]=="--verify")){
    if(!EmptyClipboard())throw new Win32Exception();
    if(SetClipboardData(15,drop)==IntPtr.Zero)throw new Win32Exception();drop=IntPtr.Zero;
    uint format=RegisterClipboardFormat("Preferred DropEffect");if(format==0||SetClipboardData(format,effect)==IntPtr.Zero)throw new Win32Exception();effect=IntPtr.Zero;
   }
   Verify(GetClipboardData(15),files);
   Console.WriteLine("{\"copied\":"+files.Length+",\"format\":\"CF_HDROP\"}");return 0;
  }catch(Exception e){Console.Error.WriteLine(e.Message);return 1;}
  finally{if(opened)CloseClipboard();if(window!=IntPtr.Zero)DestroyWindow(window);if(drop!=IntPtr.Zero)GlobalFree(drop);if(effect!=IntPtr.Zero)GlobalFree(effect);}
 }
}
