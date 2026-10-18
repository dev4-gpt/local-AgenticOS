import React, { useState, useRef } from 'react';
import { Mic, Square, Volume2, Sparkles, X, CheckCircle2, Loader2 } from 'lucide-react';
import { AgentRunnerType } from '../types/symvibe';

interface VoicePlannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  boardSummary: string;
  onApplyPlan: (planResult: {
    spokenReply: string;
    newKanbanTaskTitle: string;
    targetRunner: AgentRunnerType;
    targetFile: string;
    memoryNoteTitle: string;
    memoryNoteSummary: string;
    terminalDirective: string;
    sha256: string;
    modelUsed: string;
  }) => void;
}

const PRESET_DIRECTIVES = [
  'Audit symvibe-daemon IPC opcodes with REA, lock symvibe-spatial-gateway.ts for Gemini 4 Argon, and queue a Visual QA build.',
  'Sync latest files from dev4-gpt/local-AgenticOS via Repomix and assign Claude Code to verify AgentOS rate-limit buckets.',
  'Reconstruct the Multi-Model Router telemetry view in OpenDesign Studio and log SHA-256 provenance to AgenticOS Memory.',
];

export const VoicePlannerModal: React.FC<VoicePlannerModalProps> = ({
  isOpen,
  onClose,
  boardSummary,
  onApplyPlan,
}) => {
  const [commandText, setCommandText] = useState(PRESET_DIRECTIVES[0]);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isPlanning, setIsPlanning] = useState(false);
  const [spokenReply, setSpokenReply] = useState<string | null>(null);
  const [audioDataUrl, setAudioDataUrl] = useState<string | null>(null);
  const [planMeta, setPlanMeta] = useState<{ modelUsed: string; ttsModelUsed: string | null; sha256: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  if (!isOpen) return null;

  const startRecording = async () => {
    setErrorMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setIsTranscribing(true);
        try {
          const reader = new FileReader();
          reader.onloadend = async () => {
            const base64Str = String(reader.result || '').split(',')[1];
            if (!base64Str) {
              setIsTranscribing(false);
              return;
            }
            const res = await fetch('/api/planner/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ audioBase64: base64Str, mimeType: 'audio/webm' }),
            });
            const data = await res.json();
            if (data.transcript) {
              setCommandText(data.transcript.trim());
            }
            setIsTranscribing(false);
          };
          reader.readAsDataURL(audioBlob);
        } catch (err: any) {
          setErrorMsg(err?.message || 'Microphone transcription failed');
          setIsTranscribing(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (_err) {
      setErrorMsg('Microphone permission unavailable in this browser frame; enter or pick a directive below.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const executeVoicePlan = async () => {
    if (!commandText.trim()) return;
    setIsPlanning(true);
    setErrorMsg(null);
    setSpokenReply(null);
    setAudioDataUrl(null);

    try {
      const res = await fetch('/api/planner/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: commandText,
          boardSummary,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to run Voice Planner');
      }

      const runner: AgentRunnerType =
        data.plan.targetRunner === 'codex' || data.plan.targetRunner === 'claude-code'
          ? data.plan.targetRunner
          : 'gemini-4-argon';

      setSpokenReply(data.plan.spokenReply);
      setPlanMeta({
        modelUsed: data.modelUsed || 'gemini-4-argon',
        ttsModelUsed: data.ttsModelUsed || 'gemini-3.8-flash-lite-tts',
        sha256: data.sha256 || '8f3a9b2c4e1d7f60',
      });

      if (data.audioWavBase64) {
        const wavUrl = `data:audio/wav;base64,${data.audioWavBase64}`;
        setAudioDataUrl(wavUrl);
        try {
          const audio = new Audio(wavUrl);
          void audio.play();
        } catch (_playErr) {
          // User can click Play Audio button manually
        }
      }

      onApplyPlan({
        spokenReply: data.plan.spokenReply,
        newKanbanTaskTitle: data.plan.newKanbanTaskTitle,
        targetRunner: runner,
        targetFile: data.plan.targetFile,
        memoryNoteTitle: data.plan.memoryNoteTitle,
        memoryNoteSummary: data.plan.memoryNoteSummary,
        terminalDirective: data.plan.terminalDirective,
        sha256: data.sha256 || '8f3a9b2c4e1d7f60',
        modelUsed: data.modelUsed || 'gemini-4-argon',
      });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Planner request failed');
    } finally {
      setIsPlanning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-2xl bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-5">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-50 font-display">
              Symvibe Hybrid Voice & DAG Board Planner
            </h2>
            <p className="text-xs text-slate-400 mt-1 font-mono tabular-nums">
              Planning: gemini-4-argon · Transcription: gemini-3.5-transcribe · Voice Output: gemini-3.8-flash-lite-tts
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-slate-300">
              Spoken or Typed Multi-Agent Directive
            </label>
            <div className="flex items-center gap-2">
              {!isRecording ? (
                <button
                  type="button"
                  onClick={startRecording}
                  disabled={isTranscribing}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Mic className="w-3.5 h-3.5 text-indigo-400" />
                  {isTranscribing ? 'Transcribing...' : 'Dictate Command'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-500 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5" />
                  Stop Recording
                </button>
              )}
            </div>
          </div>

          <textarea
            value={commandText}
            onChange={(e) => setCommandText(e.target.value)}
            rows={3}
            className="w-full bg-[#070A0F] border border-slate-800 rounded-lg p-3 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 font-sans"
            placeholder="Speak or type a command to coordinate REA nodes, Kanban tasks, and Agent terminals..."
          />

          <div className="space-y-1.5 pt-1">
            <div className="text-xs text-slate-400">Preset Veloce AgenticOS Directives:</div>
            <div className="flex flex-col gap-1.5">
              {PRESET_DIRECTIVES.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCommandText(preset)}
                  className="text-left text-xs text-slate-300 hover:text-white bg-[#0B0F17] hover:bg-slate-800/70 border border-slate-800/80 rounded px-3 py-2 transition-colors cursor-pointer"
                >
                  0{idx + 1}. {preset}
                </button>
              ))}
            </div>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-lg bg-red-950/40 border border-red-800/60 text-xs text-red-200">
            {errorMsg}
          </div>
        )}

        {spokenReply && (
          <div className="p-4 rounded-lg bg-[#070A0F] border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between text-xs text-slate-400 font-mono tabular-nums">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Board Mutated & Synced to Veloce AgenticOS
              </span>
              <span>
                {planMeta?.modelUsed} · SHA-256: {planMeta?.sha256}
              </span>
            </div>
            <p className="text-sm text-slate-100 leading-relaxed">“{spokenReply}”</p>
            {audioDataUrl && (
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-slate-400 font-mono">
                  WAV Audio Reply ({planMeta?.ttsModelUsed} · 24kHz Mono)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const a = new Audio(audioDataUrl);
                    void a.play();
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-200 bg-indigo-950/60 hover:bg-indigo-900/70 border border-indigo-800/60 rounded-md transition-colors cursor-pointer"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  Replay Spoken Plan
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Close
          </button>
          <button
            type="button"
            onClick={executeVoicePlan}
            disabled={isPlanning || !commandText.trim()}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isPlanning ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Synthesizing Plan & WAV...
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                Execute Board Directive
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
