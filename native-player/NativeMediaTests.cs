using System;
using System.IO;
using System.Text;
using System.Threading;
using System.Windows.Forms;
namespace VisualNovelNativePlayer {
internal static class NativeMediaTests {
 [STAThread] static int Main() {
  try {
   byte[] wav; using(var m=new MemoryStream()) { using(var w=new BinaryWriter(m)) { int n=44100; w.Write(Encoding.ASCII.GetBytes("RIFF"));w.Write(36+n*2);w.Write(Encoding.ASCII.GetBytes("WAVEfmt "));w.Write(16);w.Write((short)1);w.Write((short)1);w.Write(44100);w.Write(88200);w.Write((short)2);w.Write((short)16);w.Write(Encoding.ASCII.GetBytes("data"));w.Write(n*2);for(int i=0;i<n;i++)w.Write((short)(Math.Sin(i*440*2*Math.PI/44100)*2000)); wav=m.ToArray(); } }
   string dir;
   using(var media=new NativeMedia()) {
    dir=media.DirectoryPath;
    media.Open("data:audio/wav;base64,"+Convert.ToBase64String(wav),true,IntPtr.Zero);
    media.SetVolume(.2);media.Play();Thread.Sleep(200);
    Assert(media.Position>0,"real native audio position advances");
    media.Pause();double p=media.Position;Thread.Sleep(150);Assert(Math.Abs(media.Position-p)<40,"pause freezes native position");
    media.SetRate(2);media.Play();Thread.Sleep(150);Assert(media.Position>p+180,"rate changes native elapsed position");
    Thread.Sleep(650);media.Tick();Thread.Sleep(100);Assert(media.Mode=="playing","loop restarts ended audio");
    media.Close();
    bool failed=false;try{media.Open("data:audio/wav;base64,AAAA",false,IntPtr.Zero);}catch(Exception ex){failed=ex.Message.Contains("media");}Assert(failed,"bad codec has explicit media error");
   }
   Assert(!Directory.Exists(dir),"extracted media removed on dispose");return 0;
  }catch(Exception ex){Console.Error.WriteLine(ex);return 1;}
 }
 static void Assert(bool value,string name){if(!value)throw new Exception("FAIL "+name);Console.WriteLine("PASS "+name);}
}}
