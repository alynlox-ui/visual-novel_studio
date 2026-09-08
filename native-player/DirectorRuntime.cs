using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;

namespace VisualNovelNativePlayer
{
    public sealed class DirectorData { public int version { get; set; } public List<DirectorTemplate> templates { get; set; } }
    public sealed class DirectorTemplate
    {
        public string id { get; set; } public string name { get; set; } public int version { get; set; }
        public Dictionary<string, object> ui { get; set; } public HomeData home { get; set; }
    }
    public sealed class PortraitData
    {
        public string mouthOpen { get; set; } public string mouthHalf { get; set; } public string mouthClosed { get; set; }
        public string eyesClosed { get; set; } public double? blinkInterval { get; set; }
    }
    public sealed class InheritStageData { public bool background { get; set; } public bool characters { get; set; } public bool bgm { get; set; } }
    public sealed class FlowData
    {
        public string mode { get; set; } public string target { get; set; } public string returnTo { get; set; }
        public Dictionary<string, object> args { get; set; } public string result { get; set; } public string value { get; set; }
    }
    public sealed class CueData
    {
        public int at { get; set; } public string type { get; set; } public string target { get; set; }
        public string expressionId { get; set; } public string themeId { get; set; }
        public double? x { get; set; } public double? y { get; set; } public double duration { get; set; } public bool keep { get; set; }
    }
    public sealed class DirectorFrame
    {
        public Dictionary<string, object> locals { get; set; } public string returnTo { get; set; } public string result { get; set; }
    }
    public sealed class DirectorMove
    {
        public double fromX { get; set; } public double fromY { get; set; } public double x { get; set; } public double y { get; set; }
        public double start { get; set; } public double duration { get; set; } public bool keep { get; set; }
    }
    public sealed class DirectorState
    {
        public int version { get; set; } public string sceneId { get; set; } public SceneData stage { get; set; }
        public Dictionary<string, object> locals { get; set; } public List<DirectorFrame> stack { get; set; }
        public string themeId { get; set; } public double clock { get; set; } public Dictionary<string, DirectorMove> moves { get; set; }
        public string line { get; set; } public List<int> applied { get; set; }
        public DirectorState() { version = 1; locals = new Dictionary<string, object>(); stack = new List<DirectorFrame>(); moves = new Dictionary<string, DirectorMove>(); applied = new List<int>(); }
    }
    internal sealed class DirectorRuntime
    {
        private readonly ProjectData project;
        internal DirectorState State { get; private set; }
        internal DirectorRuntime(ProjectData p) { project = p; Reset(); }
        internal static T Copy<T>(T value) { return Json.Create().Deserialize<T>(Json.Create().Serialize(value)); }
        internal void Reset() { State = new DirectorState(); }
        internal Dictionary<string, object> Scope(IDictionary<string, object> flags)
        {
            var result = new Dictionary<string, object>(flags); foreach (var pair in State.locals) result[pair.Key] = pair.Value; return result;
        }
        internal string Interpolate(string text, IDictionary<string, object> flags)
        {
            var values = Scope(flags);
            return Regex.Replace(text ?? "", @"\{([^}]+)\}", delegate(Match m) { object value; return values.TryGetValue(m.Groups[1].Value.Trim(), out value) ? Format(value) : m.Value; });
        }
        private static string Format(object value) { if (value == null) return "null"; if (value is bool) return (bool)value ? "true" : "false"; return Convert.ToString(value, CultureInfo.InvariantCulture); }
        internal void Theme(string id)
        {
            if (String.IsNullOrEmpty(id)) return;
            if (project.director == null || project.director.templates == null || !project.director.templates.Any(t => t.id == id)) throw new InvalidOperationException("主题不存在：" + id);
            State.themeId = id;
        }
        internal UiData Ui()
        {
            var result = Json.Create().Deserialize<Dictionary<string, object>>(Json.Create().Serialize(project.ui));
            var template = project.director == null || project.director.templates == null ? null : project.director.templates.FirstOrDefault(t => t.id == State.themeId);
            if (template != null && template.ui != null) foreach (var pair in template.ui)
            {
                var part = pair.Value as IDictionary<string, object>; object old; result.TryGetValue(pair.Key, out old);
                var merged = old as IDictionary<string, object>;
                if (part == null) continue;
                if (merged == null) merged = new Dictionary<string, object>();
                foreach (var property in part) merged[property.Key] = property.Value;
                result[pair.Key] = merged;
            }
            return Json.Create().Deserialize<UiData>(Json.Create().Serialize(result));
        }
        internal SceneData Enter(SceneData authored)
        {
            var old = State.stage; var next = Copy(authored); var inherit = authored.inheritStage ?? new InheritStageData();
            if (old != null && inherit.background) { next.bg = old.bg; next.bgImage = old.bgImage; next.video = old.video; next.videoMuted = old.videoMuted; }
            if (old != null && inherit.characters) next.characters = Copy(old.characters); else State.moves.Clear();
            if (old != null && inherit.bgm) { next.bgm = old.bgm; next.bgmVolume = old.bgmVolume; }
            Theme(authored.themeId); State.stage = next; State.sceneId = next.id; State.line = null; State.applied.Clear(); return next;
        }
        internal string Flow(SceneData sc, IDictionary<string, object> flags)
        {
            var f = sc.flow; if (f == null) return null;
            if (f.mode == "call")
            {
                if (State.stack.Count >= 32) throw new InvalidOperationException("公共剧情调用超过 32 层");
                if (!project.scenes.Any(s => s.id == f.target) || !project.scenes.Any(s => s.id == f.returnTo)) throw new InvalidOperationException("公共剧情的目标或返回场景不存在");
                State.stack.Add(new DirectorFrame { locals = Copy(State.locals), returnTo = f.returnTo, result = f.result });
                State.locals = f.args == null ? new Dictionary<string, object>() : Copy(f.args); return f.target;
            }
            if (f.mode == "return")
            {
                if (State.stack.Count == 0) throw new InvalidOperationException("没有可以返回的公共剧情调用");
                var frame = State.stack[State.stack.Count - 1];
                if (!project.scenes.Any(s => s.id == frame.returnTo)) throw new InvalidOperationException("公共剧情返回场景不存在");
                var vars = Scope(flags); var m = Regex.Match(f.value ?? "", @"^\{([^}]+)\}$"); object value;
                if (!m.Success || !vars.TryGetValue(m.Groups[1].Value.Trim(), out value)) value = Interpolate(f.value, flags);
                State.stack.RemoveAt(State.stack.Count - 1); State.locals = frame.locals ?? new Dictionary<string, object>();
                if (!String.IsNullOrEmpty(frame.result)) { if (State.locals.ContainsKey(frame.result)) State.locals[frame.result] = value; else flags[frame.result] = value; }
                return frame.returnTo;
            }
            return null;
        }
        internal void Line(string key)
        {
            if (State.line == key) return;
            foreach (var pair in State.moves.ToList()) if (!pair.Value.keep)
            {
                var c = Character(pair.Key); if (c != null) { c.x = pair.Value.x; c.y = pair.Value.y; } State.moves.Remove(pair.Key);
            }
            State.line = key; State.applied.Clear();
        }
        private SceneCharacterData Character(string id) { return State.stage == null || State.stage.characters == null ? null : State.stage.characters.FirstOrDefault(c => c.id == id); }
        internal void Reveal(DialogueData dialogue, int count)
        {
            if (dialogue == null || dialogue.cues == null) return;
            for (int i = 0; i < dialogue.cues.Count; i++)
            {
                var cue = dialogue.cues[i]; if (cue == null || State.applied.Contains(i) || cue.at > count) continue;
                State.applied.Add(i);
                if (cue.type == "theme") { Theme(cue.themeId); continue; }
                var ch = Character(cue.target); if (ch == null) continue;
                if (cue.type == "expression") ch.expressionId = cue.expressionId ?? "";
                if (cue.type == "move") State.moves[cue.target] = new DirectorMove { fromX = ch.x ?? 50, fromY = ch.y ?? 88, x = cue.x ?? ch.x ?? 50, y = cue.y ?? ch.y ?? 88, start = State.clock, duration = Math.Max(0, cue.duration), keep = cue.keep };
            }
            UpdateMoves();
        }
        private void UpdateMoves()
        {
            foreach (var pair in State.moves.ToList())
            {
                var c = Character(pair.Key); var m = pair.Value; if (c == null) { State.moves.Remove(pair.Key); continue; }
                double k = m.duration <= 0 ? 1 : Math.Min(1, Math.Max(0, (State.clock - m.start) / m.duration));
                c.x = m.fromX + (m.x - m.fromX) * k; c.y = m.fromY + (m.y - m.fromY) * k;
                if (k == 1) State.moves.Remove(pair.Key);
            }
        }
        internal void Tick(double dt) { State.clock += Math.Max(0, Math.Min(250, dt)); UpdateMoves(); }
        internal string Image(SceneCharacterData ch, DialogueData d, bool speaking)
        {
            var lib = project.characters.FirstOrDefault(c => c.id == ch.charId);
            bool active = d != null && (d.charId == ch.id || (String.IsNullOrEmpty(d.charId) && d.speaker == (ch.name ?? (lib == null ? null : lib.name))));
            string eid = !String.IsNullOrEmpty(ch.expressionId) ? ch.expressionId : active && d != null ? d.expressionId : null;
            string aid = active && d != null && !String.IsNullOrEmpty(d.actionId) ? d.actionId : ch.actionId;
            var exp = lib == null || lib.expressions == null ? null : lib.expressions.FirstOrDefault(e => e.id == eid);
            var act = lib == null || lib.actions == null ? null : lib.actions.FirstOrDefault(a => a.id == aid);
            string source = exp != null && !String.IsNullOrEmpty(exp.image) ? exp.image : act != null && !String.IsNullOrEmpty(act.image) ? act.image : !String.IsNullOrEmpty(ch.image) ? ch.image : lib == null ? "" : lib.baseImage;
            var p = ch.portrait ?? (lib == null ? null : lib.portrait); if (p == null) return source ?? "";
            double period = Math.Max(1000, p.blinkInterval.GetValueOrDefault(4000));
            if (!String.IsNullOrEmpty(p.eyesClosed) && State.clock % period > period - 160) return p.eyesClosed;
            string variant = p.mouthClosed;
            if (active && speaking) { int phase = (int)(State.clock / 110) % 4; variant = phase == 0 ? p.mouthClosed : phase == 2 ? p.mouthHalf : p.mouthOpen; }
            return String.IsNullOrEmpty(variant) ? source ?? "" : variant;
        }
        internal DirectorState Snapshot() { return Copy(State); }
        internal SceneData Restore(DirectorState state, SceneData authored)
        {
            Reset(); if (state == null || state.version != 1) return authored == null ? null : Enter(authored);
            State = Copy(state); State.locals = State.locals ?? new Dictionary<string, object>(); State.stack = State.stack ?? new List<DirectorFrame>();
            State.moves = State.moves ?? new Dictionary<string, DirectorMove>(); State.applied = State.applied ?? new List<int>();
            if (State.stack.Count > 32) throw new InvalidOperationException("存档调用栈超过 32 层");
            return State.stage ?? Enter(authored);
        }
    }
}
