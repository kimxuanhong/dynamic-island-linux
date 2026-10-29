import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';

// Clip the complete painted actor, including its image, to a 25% radius.
const code = `
    vec2 p = abs(cogl_tex_coord_in[0].xy - vec2(0.5)) - vec2(0.25);
    float distance = length(max(p, vec2(0.0))) + min(max(p.x, p.y), 0.0) - 0.25;
    float edge = max(fwidth(distance), 0.0001);
    cogl_color_out *= 1.0 - smoothstep(-edge, edge, distance);
`;

// GNOME 51 moved the snippet API from Shell.GLSLEffect to Clutter.ShaderEffect.
export const RoundedArtEffect = Shell.GLSLEffect
    ? GObject.registerClass(class RoundedArtEffect extends Shell.GLSLEffect {
        vfunc_build_pipeline() {
            this.add_glsl_snippet(Cogl.SnippetHook.FRAGMENT, '', code, false);
        }
    })
    : GObject.registerClass(class RoundedArtEffect extends Clutter.ShaderEffect {
        vfunc_get_static_snippet() {
            return Cogl.Snippet.new(Cogl.SnippetHook.FRAGMENT, '', code);
        }
    });
