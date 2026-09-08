using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Windows.Forms;

namespace VisualNovelNativePlayer
{
    // Runs the shipping form, canvas, toolbar and persistence handlers on the STA entry thread.
    internal static class DirectorSelfTest
    {
        private static readonly List<string> checks = new List<string>();
        private static void Check(string name, bool ok) { checks.Add(name + "=" + (ok ? "true" : "false")); }
        private static void Invoke(GameForm f, string method) { typeof(GameForm).GetMethod(method, BindingFlags.Instance | BindingFlags.NonPublic).Invoke(f, null); }
        private static void Button(GameForm f, string text) { f.Controls.OfType<ToolStrip>().Single().Items.OfType<ToolStripButton>().First(b => b.Text == text).PerformClick(); }
        private static ProjectData Fixture()
        {
            return Json.Create().Deserialize<ProjectData>(@"{
 'id':'director-test','title':'Director fixture','startScene':'a','flags':{'n':1,'entry':0,'gate':0},
 'experience':{'chapterSelection':true,'autosave':true},
 'director':{'version':1,'templates':[{'id':'red','version':1,'ui':{'textbox':{'bg':'#ff0000','opacity':1}}}]},
 'characters':[{'id':'lib','name':'Actor','baseImage':'base','expressions':[{'id':'happy','image':'happy'}],'portrait':{'mouthOpen':'open','mouthHalf':'half','eyesClosed':'blink','blinkInterval':1000}}],
 'scenes':[
 {'id':'a','bg':'#123456','bgm':'','characters':[{'id':'actor','charId':'lib','x':10,'y':80}], 'setFlags':[{'flag':'entry','op':'+','value':1}],
 'dialogues':[{'text':'abcdefghij','charId':'actor','cues':[{'at':2,'type':'expression','target':'actor','expressionId':'happy'},{'at':2,'type':'move','target':'actor','x':90,'y':20,'duration':1000,'keep':true},{'at':2,'type':'theme','themeId':'red'}]},{'text':'second','cues':[{'at':0,'type':'move','target':'actor','x':0,'y':0,'duration':1000,'keep':false}]}],
 'flow':{'mode':'call','target':'sub','returnTo':'end','args':{'n':7,'word':'literal'},'result':'answer'}},
 {'id':'sub','inheritStage':{'background':true,'characters':true,'bgm':true},'dialogues':[{'text':'{word} {n}'}], 'next':'ret'},
 {'id':'ret','inheritStage':{'characters':true},'dialogues':[{'text':'return'}], 'flow':{'mode':'return','value':'{n}'}},
 {'id':'end','dialogues':[{'text':'answer {answer}'}],'choices':[{'text':'locked','target':'done','enableCond':'gate == 1','disabledReason':'Need gate'},{'text':'hidden','cond':'false','target':'done'}]},
 {'id':'done','dialogues':[{'text':'done'}],'ending':{'title':'Done'}}] }".Replace('\'', '"'));
        }
        public static int Run(string path)
        {
            checks.Clear(); var p = Fixture(); p.id += "-" + Guid.NewGuid().ToString("N");
            try
            {
                using (var f = new GameForm(p))
                {
                    f.StartGame(); var ch = f.CurrentScene.characters[0];
                    Check("new run resets director", f.CaptureSnapshot().director.clock == 0 && f.CaptureSnapshot().director.stack.Count == 0);
                    f.TickPlayback(60);
                    Check("reveal threshold expression and theme", ch.expressionId == "happy" && f.RuntimeUi.textbox.bg == "#ff0000" && p.ui.textbox.bg != "#ff0000");
                    f.TickPlayback(100); double x = ch.x.Value;
                    Check("move interpolates", Math.Abs(x - 18) < .001);
                    Check("mouth uses active speaker clock", f.ResolveVisual(ch).Source == "open");
                    Button(f, "暂停 / 继续"); var frozen = Json.Create().Serialize(f.CaptureSnapshot().director); f.TickPlayback(100);
                    Check("pause freezes director and text", frozen == Json.Create().Serialize(f.CaptureSnapshot().director) && f.VisibleText.Length == 5);
                    Button(f, "暂停 / 继续"); Button(f, "2× / 1×"); f.TickPlayback(100);
                    Check("rate scales movement", Math.Abs(ch.x.Value - 34) < .001);
                    f.ResetTiming(); f.Advance(); Check("instant finish applies cues once", f.CaptureSnapshot().director.applied.Count == 3);
                    var saved = f.CaptureSnapshot(); Invoke(f, "SaveProgress");
                    f.Advance(); Check("next line resets cue ledger", f.CaptureSnapshot().director.applied.SequenceEqual(new[] { 0 }));
                    f.GoBack(); Check("back restores clock moves theme reveal", Json.Create().Serialize(f.CaptureSnapshot().director) == Json.Create().Serialize(saved.director) && f.VisibleText == "abcdefghij");
                    f.Advance(); Invoke(f, "LoadProgress");
                    Check("manual save load restores director and backlog without entry replay", Json.Create().Serialize(f.CaptureSnapshot().director) == Json.Create().Serialize(saved.director) && Convert.ToDouble(f.Flags["entry"]) == 1 && f.Backlog.Count == saved.backlog.Count && f.CaptureSnapshot().playbackRate == 2);
                    f.Advance(); f.Advance(); f.Advance();
                    Check("call handler enters callee with locals", f.CurrentSceneId == "sub" && f.DisplayText("{word} {n}") == "literal 7" && Convert.ToDouble(f.Flags["n"]) == 1 && f.CaptureSnapshot().director.stack.Count == 1);
                    Check("stage inherits effective expression and coordinates", f.CurrentScene.bg == "#123456" && f.CurrentScene.characters[0].expressionId == "happy");
                    var sub = f.CaptureSnapshot(); Invoke(f, "SaveProgress");
                    using (var reload = new GameForm(p)) { Invoke(reload, "LoadProgress"); Check("disk load restores call locals and inherited stage", reload.DisplayText("{n}") == "7" && reload.CurrentScene.bg == "#123456"); reload.GoBack(); Check("disk load restores navigable director history", reload.CurrentSceneId == "a" && reload.CaptureSnapshot().director.stack.Count == 0); }
                    // Scope must affect the same parser used by real choices.
                    Check("conditions use local shadowing and fail closed", f.ChoiceEnabled(new ChoiceData { enableCond = "n == 7" }) && !f.ChoiceEnabled(new ChoiceData { enableCond = "constructor('x')" }));
                    f.Advance(); f.Advance(); Check("normal scene keeps callee locals", f.CurrentSceneId == "ret" && f.DisplayText("{n}") == "7");
                    Check("nonkeep move snaps at next line", f.CurrentScene.characters[0].x == 0 && f.CurrentScene.characters[0].y == 0);
                    f.Advance(); f.Advance(); Check("return handler restores scope and result", f.CurrentSceneId == "end" && Convert.ToDouble(f.Flags["answer"]) == 7 && f.DisplayText("{n}") == "1" && f.CaptureSnapshot().director.stack.Count == 0);
                    f.GoBack(); Check("back over return restores call frame", f.CurrentSceneId == "ret" && f.CaptureSnapshot().director.stack.Count == 1); f.Advance();
                    f.Advance(); f.Advance(); Check("choice visibility separate from disabled reason", f.Mode == PlayerMode.Choices && f.VisibleChoices.Count == 1 && f.ChoiceCaption(f.VisibleChoices[0]).Contains("Need gate"));
                    f.SelectChoice(0); Check("disabled handler blocks navigation", f.CurrentSceneId == "end");
                    f.Flags["gate"] = 1; Check("eligibility rechecked", f.ChoiceEnabled(f.VisibleChoices[0])); f.Flags["gate"] = 0; f.SelectChoice(0); Check("stale eligibility rejected", f.CurrentSceneId == "end");
                    var canvas = f.Controls.OfType<GameCanvas>().Single();
                    using (var bmp = new Bitmap(canvas.Width, canvas.Height)) {
                        canvas.DrawToBitmap(bmp, new Rectangle(Point.Empty, bmp.Size));
                        Color panel = bmp.GetPixel((int)(bmp.Width * .1), bmp.Height - 60);
                        Color disabled = bmp.GetPixel((int)(bmp.Width * .5), (int)(bmp.Height * .34 - 20));
                        Check("real canvas renders runtime theme pixels", panel.R > 240 && panel.G < 15 && panel.B < 15);
                        Check("real canvas renders disabled choice pixels", disabled.R < 100 && Math.Abs(disabled.R - disabled.G) < 10);
                    }
                    f.Flags["gate"] = 1; f.SelectChoice(0); Check("enabled choice preserves navigation", f.CurrentSceneId == "done");
                    Check("chapter handler restores inherited stage and stack", f.TryJumpToChapter("sub") && f.CurrentScene.bg == "#123456" && f.CaptureSnapshot().director.stack.Count == 1 && Convert.ToDouble(f.Flags["entry"]) == 1);
                    Check("chapter autosave holds restored director", Json.Create().Deserialize<PlayerSnapshot>(File.ReadAllText(f.AutosaveFilePath)).director.stack.Count == 1);
                    f.RestoreSnapshot(sub); f.SetTextSpeed(0); f.TickPlayback(1); Check("instant text mode finishes through handler", f.VisibleText == "literal 7");
                    f.StartGame(); f.SetTextSpeed(0); f.TickPlayback(1); Check("instant text applies all cues", f.CaptureSnapshot().director.applied.Count == 3);
                    f.SetTextSpeed(30); f.StartGame(); f.TickPlayback(110); Check("mouth frame selected", f.ResolveVisual(f.CurrentScene.characters[0]).Source == "open");
                    for (int i = 0; i < 4; i++) f.TickPlayback(200);
                    Check("blink overrides expression", f.ResolveVisual(f.CurrentScene.characters[0]).Source == "blink");
                    f.TickPlayback(100); Check("finished mouth falls back to cue expression", f.ResolveVisual(f.CurrentScene.characters[0]).Source == "happy");
                    f.StartGame(); Check("restart clears theme expression clock stack", f.CaptureSnapshot().director.clock == 0 && f.CaptureSnapshot().director.themeId == null && f.CurrentScene.characters[0].expressionId == null && Convert.ToDouble(f.Flags["entry"]) == 1);
                }
                using (var reopened = new GameForm(p)) { Check("chapter director persists across form reopen", reopened.TryJumpToChapter("sub") && reopened.CaptureSnapshot().director.stack.Count == 1 && reopened.DisplayText("{n}") == "7"); }
                var loop = Fixture(); loop.id = p.id + "-loop"; loop.scenes[0].dialogues.Clear(); loop.scenes[0].flow.target = "a";
                using (var f = new GameForm(loop)) { f.StartGame(); Check("recursive call bounded at 32", f.Mode == PlayerMode.Ending && f.EndingTitle.Contains("32") && f.CaptureSnapshot().director.stack.Count == 32); }
                loop.scenes[0].flow.target = "missing";
                using (var f = new GameForm(loop)) { f.StartGame(); Check("missing call target errors", f.Mode == PlayerMode.Ending && f.EndingTitle.Contains("不存在")); }
                loop.scenes[0].flow = null; loop.scenes[0].next = "a";
                using (var f = new GameForm(loop)) { f.StartGame(); Check("empty scene cycle bounded", f.Mode == PlayerMode.Ending && f.EndingTitle.Contains("128")); }
            }
            catch (Exception e) { checks.Add("exception=" + e); }
            bool ok = checks.All(c => c.EndsWith("=true"));
            Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path)));
            File.WriteAllText(path, Json.Create().Serialize(new { ok = ok, checkCount = checks.Count, checks = checks }), new UTF8Encoding(false));
            foreach (string id in new[] { p.id, p.id + "-loop" }) { p.id = id; foreach (string file in new[] { PlayerSettings.FilePath(p), ExperienceProgress.FilePath(p), GameForm.ManualSlotFile(p, 0), GameForm.AutosaveFile(p) }) if (File.Exists(file)) File.Delete(file); }
            return ok ? 0 : 1;
        }
    }
}
