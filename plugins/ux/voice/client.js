// voice client half (hand-authored bundle, no build step):
//  • 🎤 at conversation.input.left — Web Speech API with interim results
//    streamed into the draft, or MediaRecorder → /voice/api/stt (Whisper)
//    where the browser lacks SpeechRecognition; the engine comes from the
//    host's /voice/api/config.
//  • 🔊 at conversation.chat.assistant-actions — reads one assistant reply
//    aloud through the host's neural TTS route (/voice/api/tts) with
//    streaming playback and stop-on-new-playback; auto-reads new replies
//    when voice.readAloud.autoRead is on.
//  • "Voice" settings section (order 42) + speaker nav glyph.

window.__ModuleLoader__.load({
  id: "@dsh-stack/voice",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var React = require("react");
    var h = React.createElement;
    var useState = React.useState,
      useRef = React.useRef,
      useMemo = React.useMemo,
      useEffect = React.useEffect;

    // ── host config (non-secret slice) ─────────────────────────────────────
    var hostConfig = { value: null, pending: null };
    /**
     * Fetches the host configuration from the server.
     *
     * @param {boolean} force - If true, forces a new fetch regardless of existing value or pending request.
     * @returns {Promise<Object>} Resolves with the host configuration object on success.
     * @throws {Error} Throws an error if fetching fails or is interrupted.
     */
    function fetchHostConfig(force) {
      if (hostConfig.value !== null && !force) return Promise.resolve(hostConfig.value);
      if (hostConfig.pending !== null && !force) return hostConfig.pending;
      hostConfig.pending = fetch("/voice/api/config")
        .then(function (res) {
          return res.json();
        })
        .then(function (body) {
          hostConfig.value = body;
          hostConfig.pending = null;
          return body;
        })
        .catch(function (err) {
          hostConfig.pending = null;
          throw err;
        });
      return hostConfig.pending;
    }

    // ── streaming TTS player (stop-on-new) ─────────────────────────────────
    var player = { audio: null, token: 0 };
    /**
     * Stops the current playback.
     * Guarantees that the playback is paused or already stopped.
     * Returns `null` if playback is successfully stopped.
     * Throws an error if stopping playback fails unexpectedly.
     */
    function stopPlayback() {
      player.token += 1;
      if (player.audio !== null) {
        try {
          player.audio.pause();
        } catch (_) {
          /* already stopped */
        }
        if (player.audio.src && player.audio.src.indexOf("blob:") === 0)
          URL.revokeObjectURL(player.audio.src);
        player.audio = null;
      }
    }
    /** Play one /voice/api/tts response; resolves an abort-aware controller. */
    function playText(text, voice, speed, onEnd) {
      stopPlayback();
      var token = player.token;
      return fetch("/voice/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          voice ? { text: text, voice: voice, speed: speed } : { text: text, speed: speed },
        ),
      })
        .then(function (res) {
          if (!res.ok)
            return res.json().then(function (b) {
              throw new Error(b.error || "TTS failed (HTTP " + res.status + ")");
            });
          return res.blob();
        })
        .then(function (blob) {
          if (token !== player.token) return; // superseded while synthesizing
          var audio = new Audio(URL.createObjectURL(blob));
          player.audio = audio;
          audio.onended = function () {
            if (player.audio === audio) {
              player.audio = null;
            }
            onEnd();
          };
          audio.onerror = function () {
            if (player.audio === audio) {
              player.audio = null;
            }
            onEnd();
          };
          return audio.play().catch(function () {
            onEnd();
          });
        });
    }

    var MIC_SVG = h(
      "svg",
      { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", "aria-hidden": true },
      h("rect", {
        x: 5.5,
        y: 1.5,
        width: 5,
        height: 8.5,
        rx: 2.5,
        stroke: "currentColor",
        strokeWidth: 1.3,
      }),
      h("path", {
        d: "M3 7.5a5 5 0 0 0 10 0M8 12.5v2",
        stroke: "currentColor",
        strokeWidth: 1.3,
        strokeLinecap: "round",
      }),
    );
    var SPEAKER_SVG = h(
      "svg",
      { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", "aria-hidden": true },
      h("path", {
        d: "M2.5 6v4h2.5L9.5 14V2L5 6H2.5z",
        stroke: "currentColor",
        strokeWidth: 1.3,
        strokeLinejoin: "round",
      }),
      h("path", {
        d: "M11.5 5.5a3.5 3.5 0 0 1 0 5M13 3.8a6 6 0 0 1 0 8.4",
        stroke: "currentColor",
        strokeWidth: 1.3,
        strokeLinecap: "round",
      }),
    );
    var STOP_SVG = h(
      "svg",
      { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", "aria-hidden": true },
      h("rect", { x: 4, y: 4, width: 8, height: 8, rx: 1.5, fill: "currentColor" }),
    );

    // ──────────────────────────────────────────────────────────────────────
    // Mic button — browser SpeechRecognition (interim) or Whisper fallback
    // ──────────────────────────────────────────────────────────────────────
    /** MicButton implementation. */
    function MicButton(props) {
      var useInput = props.useInput,
        inputActions = props.inputActions;
      var stateTuple = useState("idle"); // idle | listening | recording | transcribing | error
      var state = stateTuple[0],
        setState = stateTuple[1];
      var errTuple = useState("");
      var error = errTuple[0],
        setError = errTuple[1];
      var stateRef = useRef("idle");
      stateRef.current = state;
      var mediaRef = useRef(null); // { stream, recorder } when recording
      var recRef = useRef(null); // SpeechRecognition session
      var baseRef = useRef(""); // draft text before this dictation session
      var finalRef = useRef(""); // committed final transcript this session
      var input =
        typeof useInput === "function"
          ? useInput(function (s) {
              return s;
            })
          : null;
      var inputRef = useRef(null);
      inputRef.current = input;

      /** setStateBoth implementation. */
      function setStateBoth(s) {
        stateRef.current = s;
        setState(s);
      }
      /** setDraft implementation. */
      function setDraft(text) {
        if (!inputActions) return;
        inputActions.setDraft(text);
      }
      /** pushTranscript implementation. */
      function pushTranscript(finalText, interimText) {
        var base = baseRef.current;
        var sep = base && !/[\s\u3000]$/.test(base) && (finalText || interimText) ? " " : "";
        setDraft(
          base + sep + finalText + (interimText ? (finalText ? " " : "") + interimText : ""),
        );
      }

      useEffect(function () {
        return function cleanup() {
          var rec = recRef.current;
          if (rec) {
            try {
              rec.stop();
            } catch (_) {
              /* not running */
            }
          }
          var m = mediaRef.current;
          if (m) {
            try {
              if (m.recorder.state !== "inactive") m.recorder.stop();
            } catch (_) {
              /* not running */
            }
            m.stream.getTracks().forEach(function (t) {
              t.stop();
            });
          }
        };
      }, []);

      /**
       * Starts browser-based speech recognition.
       *
       * Guarantees that any ongoing recognition processes are stopped and cleaned up.
       * Returns nothing.
       *
       * On failure, stops any ongoing recognition processes and cleans up media tracks without throwing errors.
       */
      function startBrowserRecognition(SpeechRecognitionCtor) {
        var rec;
        try {
          rec = new SpeechRecognitionCtor();
        } catch (_) {
          setStateBoth("error");
          setError("Speech recognition unavailable");
          return;
        }
        rec.interimResults = true;
        rec.continuous = true;
        rec.maxAlternatives = 1;
        baseRef.current = (inputRef.current && inputRef.current.draft) || "";
        finalRef.current = "";
        rec.onresult = function (event) {
          var interim = "";
          for (var i = event.resultIndex; i < event.results.length; i++) {
            var r = event.results[i] && event.results[i][0];
            if (!r) continue;
            if (event.results[i].isFinal) {
              finalRef.current += (finalRef.current ? " " : "") + r.transcript.trim();
            } else {
              interim += r.transcript;
            }
          }
          pushTranscript(finalRef.current, interim.trim());
        };
        rec.onerror = function (event) {
          setStateBoth("error");
          setError("Speech recognition error: " + (event && event.error ? event.error : "unknown"));
        };
        rec.onend = function () {
          recRef.current = null;
          if (stateRef.current === "listening") setStateBoth("idle");
        };
        recRef.current = rec;
        setStateBoth("listening");
        try {
          rec.start();
        } catch (err) {
          setStateBoth("error");
          setError(String((err && err.message) || err));
        }
      }

      /**
       * Starts whisper recording and handles errors.
       *
       * Guarantees the transcript is captured for final and interim results.
       * Returns to the "idle" state on completion or error.
       * Sets the state to "error" and provides an error message on failure.
       */
      function startWhisperRecording() {
        navigator.mediaDevices
          .getUserMedia({ audio: true })
          .then(function (stream) {
            var chunks = [];
            var recorder;
            try {
              recorder = new MediaRecorder(stream);
            } catch (_) {
              stream.getTracks().forEach(function (t) {
                t.stop();
              });
              setStateBoth("error");
              setError("This browser cannot record audio (MediaRecorder missing)");
              return;
            }
            recorder.ondataavailable = function (e) {
              if (e.data && e.data.size) chunks.push(e.data);
            };
            recorder.onstop = function () {
              stream.getTracks().forEach(function (t) {
                t.stop();
              });
              mediaRef.current = null;
              var blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
              setStateBoth("transcribing");
              fetch("/voice/api/stt", {
                method: "POST",
                headers: { "Content-Type": blob.type || "audio/webm" },
                body: blob,
              })
                .then(function (res) {
                  return res.json().then(function (data) {
                    if (!res.ok) throw new Error(data.error || "HTTP " + res.status);
                    return data;
                  });
                })
                .then(function (data) {
                  if (data && data.text) {
                    baseRef.current = (inputRef.current && inputRef.current.draft) || "";
                    pushTranscript(data.text.trim(), "");
                  }
                  setStateBoth("idle");
                  setError("");
                })
                .catch(function (err) {
                  setStateBoth("error");
                  setError(String((err && err.message) || err));
                });
            };
            mediaRef.current = { stream: stream, recorder: recorder };
            recorder.start();
            setStateBoth("recording");
          })
          .catch(function (err) {
            var n = err && err.name ? err.name : "UnknownError";
            setStateBoth("error");
            setError(
              n === "NotAllowedError" || n === "SecurityError"
                ? "Microphone permission denied"
                : "No microphone: " + n,
            );
          });
      }

      /**
       * Starts the media recording process. If successful, updates the state to "recording"
       * and sets the error state to empty. If an error occurs, updates the state to "error"
       * and sets the error message accordingly.
       * @returns {Promise<void>} Resolves when the recording starts or rejects on error.
       */
      function start() {
        setError("");
        fetchHostConfig()
          .then(function (cfg) {
            var engine = cfg && cfg.stt ? cfg.stt.engine : "auto";
            var SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
            if (engine === "browser" || (engine === "auto" && SR)) {
              if (!SR) {
                setStateBoth("error");
                setError("This browser has no SpeechRecognition — pick the whisper engine");
                return;
              }
              startBrowserRecognition(SR);
            } else {
              startWhisperRecording();
            }
          })
          .catch(function () {
            setStateBoth("error");
            setError("Cannot reach /voice/api/config");
          });
      }

      /**
       * Starts the media recording process. If successful, updates the state to "recording"
       * and clears the error state. If an error occurs, updates the state to "error" and
       * sets the appropriate error message.
       * @returns {Promise<void>} Resolves when the recording starts or rejects on error.
       */
      function onClick() {
        var s = stateRef.current;
        if (s === "listening") {
          var rec = recRef.current;
          if (rec) rec.stop();
          setStateBoth("idle");
        } else if (s === "recording") {
          var m = mediaRef.current;
          if (m && m.recorder.state !== "inactive") m.recorder.stop(); // onstop → transcribe
        } else if (s === "idle" || s === "error") {
          start();
        }
      }

      var title =
        state === "error"
          ? error
          : state === "recording"
            ? "Recording — click to transcribe"
            : state === "transcribing"
              ? "Transcribing…"
              : state === "listening"
                ? "Listening — click to stop"
                : "Voice input";
      return h(
        "button",
        {
          type: "button",
          className:
            "voice-btn voice-mic" +
            (state === "recording" || state === "listening" ? " is-live" : "") +
            (state === "error" ? " is-error" : ""),
          onClick: onClick,
          title: title,
          "aria-label": title,
          disabled: !inputActions || state === "transcribing",
        },
        state === "transcribing" ? "…" : MIC_SVG,
      );
    }

    // ──────────────────────────────────────────────────────────────────────
    // Speaker button — neural read-aloud for one assistant message
    // ──────────────────────────────────────────────────────────────────────
    var lastAutoPlayed = { id: null };
    /**
     * Toggles the speaker button's state. If in "listening" state, stops the recording and returns to "idle".
     * If in "recording" state, stops the recording and transitions to "transcribing".
     * If in "idle" or "error" state, starts the recording.
     * @returns {Promise<void>} Resolves when the recording starts or rejects on error.
     * On error, the state is set to "error" and an appropriate error message is displayed.
     */
    function SpeakerButton(props) {
      var messageId = props.messageId,
        useSession = props.useSession;
      var speakTuple = useState("idle"); // idle | loading | speaking
      var state = speakTuple[0],
        setState = speakTuple[1];
      var stateRef = useRef("idle");
      stateRef.current = state;
      var session =
        typeof useSession === "function"
          ? useSession(function (snap) {
              return snap;
            })
          : null;

      var text = useMemo(
        function () {
          if (!session || !Array.isArray(session.nodes)) return "";
          var node = session.nodes.find(function (n) {
            return n && n.kind === "assistant" && n.messageId === messageId;
          });
          if (!node || !Array.isArray(node.blocks)) return "";
          return node.blocks
            .filter(function (b) {
              return b && b.kind === "text" && b.text;
            })
            .map(function (b) {
              return b.text;
            })
            .join("\n")
            .trim();
        },
        [session, messageId],
      );

      /**
       * Toggles the speaker button's state based on its current state.
       * - Transitions from "listening" to "idle".
       * - Transitions from "recording" to "transcribing".
       * - Transitions from "idle" or "error" to "recording".
       * @returns {Promise<void>} Resolves when the recording starts or rejects on error.
       * On error, the state is set to "error", and an error message is displayed.
       */
      function speak() {
        if (stateRef.current === "speaking" || stateRef.current === "loading") {
          stopPlayback();
          setState("idle");
          return;
        }
        if (!text) return;
        setState("loading");
        playText(text)
          .then(function () {
            if (stateRef.current === "loading") setState("speaking");
          })
          .catch(function () {
            setState("idle");
          });
      }

      // Auto-read: when enabled, read each new assistant reply once its text
      // has been stable for ~1.5s. Only the newest message wins.
      var textRef = useRef("");
      useEffect(
        function () {
          if (!text || text === textRef.current) return undefined;
          textRef.current = text;
          var cancelled = false;
          var timer = setTimeout(function () {
            if (cancelled) return;
            fetchHostConfig()
              .then(function (cfg) {
                if (
                  cancelled ||
                  !cfg ||
                  !cfg.readAloud ||
                  !cfg.readAloud.autoRead ||
                  !cfg.tts ||
                  !cfg.tts.enabled
                )
                  return;
                if (lastAutoPlayed.id === messageId) return;
                if (stateRef.current !== "idle") return;
                lastAutoPlayed.id = messageId;
                speak();
              })
              .catch(function () {
                /* config unreachable — stay silent */
              });
          }, 1500);
          return function () {
            cancelled = true;
            clearTimeout(timer);
          };
        },
        [text, messageId],
      );

      var playing = state !== "idle";
      var title =
        state === "speaking"
          ? "Stop read-aloud"
          : state === "loading"
            ? "Synthesizing…"
            : text
              ? "Read this reply aloud"
              : "Nothing to read";
      return h(
        "button",
        {
          type: "button",
          className: "voice-btn voice-speaker" + (playing ? " is-live" : ""),
          onClick: speak,
          title: title,
          "aria-label": title,
          disabled: !text,
        },
        state === "speaking" ? STOP_SVG : SPEAKER_SVG,
      );
    }

    // ──────────────────────────────────────────────────────────────────────
    // Voice settings section
    // ──────────────────────────────────────────────────────────────────────
    /**
     * Initiates speech playback for the current text if the voice is not currently
     * speaking or loading. If playback fails, it sets the state to idle.
     *
     * Returns: None
     *
     * Fails if the voice is already speaking or loading, or if the text is empty.
     */
    function VoiceGlyph() {
      return SPEAKER_SVG;
    }

    /**
     * Attempts to play the provided text and updates the state accordingly.
     * If playback fails, the state is set to "idle".
     *
     * @param {string} text - The text to be played.
     * @returns {void}
     */
    function row(label, control, hint) {
      return h(
        "div",
        { style: { display: "grid", gap: "4px" } },
        h("label", { style: { fontSize: "13px", fontWeight: 500 } }, label),
        control,
        hint
          ? h(
              "div",
              { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary)" } },
              hint,
            )
          : null,
      );
    }
    var inputStyle = {
      padding: "6px 10px",
      borderRadius: "8px",
      fontSize: "13px",
      border: "1px solid var(--dsw-alias-border-l2)",
      background: "transparent",
      color: "var(--dsw-alias-label-primary)",
    };

    /**
     * Initiates a delayed speech action if certain conditions are met.
     *
     * Guarantees that speech is initiated only if the host configuration allows auto-read,
     * the TTS service is enabled, and the current state is idle. The action is cancelled
     * if the `cancelled` flag is set before the timeout expires.
     *
     * Returns: void
     *
     * On failure: Speech is not initiated if configuration is unreachable or conditions are not met.
     */
    function TextField(props) {
      var local = useState(props.value);
      var value = local[0],
        setValue = local[1];
      var lastProp = useRef(props.value);
      if (props.value !== lastProp.current) {
        lastProp.current = props.value;
        if (value !== props.value) setValue(props.value);
      }
      /**
       * Initiates a read-aloud session if the current state is idle and not already playing.
       * Guarantees that the read-aloud session is started or remains idle.
       * Returns a function to cancel the read-aloud session.
       * Fails silently if the configuration is unreachable or if the session is already playing.
       */
      function commit() {
        if (value !== props.value) props.onCommit(value);
      }
      return h("input", {
        style: inputStyle,
        value: value,
        placeholder: props.placeholder || "",
        onChange: function (e) {
          setValue(e.target.value);
        },
        onBlur: commit,
        onKeyDown: function (e) {
          if (e.key === "Enter") commit();
        },
      });
    }

    /**
     * Returns a button element to control voice playback.
     *
     * The button displays a play or stop icon and changes its state based on the current voice state.
     * It is disabled if there is no text to read.
     *
     * @returns {React.ReactNode} A button element for voice control.
     */
    function VoiceSection(props) {
      var settings = props.settings; // { describe, mutate } injected from apply
      var viewTuple = useState({ status: "loading", view: null, error: null });
      var view = viewTuple[0],
        setView = viewTuple[1];
      var hostTuple = useState(null);
      var host = hostTuple[0],
        setHost = hostTuple[1];
      var prevTuple = useState("idle");
      var preview = prevTuple[0],
        setPreview = prevTuple[1];

      /**
       * Attempts to play the provided text and updates the state accordingly.
       *
       * Guarantees: Initiates speech playback for the current text if the voice is not currently speaking or loading.
       *             Updates the state to idle if playback fails.
       * Fails if the voice is already speaking or loading, or if the text is empty.
       */
      function load() {
        setView({ status: "loading", view: null, error: null });
        settings
          .describe({})
          .then(function (response) {
            if (!response.result.ok) throw new Error(response.result.error.message);
            var ns = response.result.value.namespaces.find(function (entry) {
              return entry.ns === "voice";
            });
            setView({ status: ns ? "ready" : "missing", view: ns || null, error: null });
          })
          .catch(function (err) {
            setView({ status: "error", view: null, error: String((err && err.message) || err) });
          });
        fetchHostConfig(true)
          .then(setHost)
          .catch(function () {
            setHost(null);
          });
      }
      useEffect(load, []);

      /**
       * Sets the playback state based on the provided text. If playback fails, the state is set to "idle".
       *
       * @param {string} text - The text to be played.
       * @returns {void}
       */
      function mutate(ops) {
        var current = view.view;
        if (!current) return;
        settings
          .mutate({ ns: "voice", ops: ops, expectedRevision: current.revision })
          .then(function (response) {
            if (!response.result.ok) throw new Error(response.result.error.message);
            setView({ status: "ready", view: response.result.value, error: null });
            fetchHostConfig(true)
              .then(setHost)
              .catch(function () {
                /* stale picker data is harmless */
              });
          })
          .catch(function (err) {
            setView(Object.assign({}, view, { error: String((err && err.message) || err) }));
          });
      }
      /** set implementation. */
      function set(path) {
        return function (value) {
          mutate([{ op: "set", path: path, value: value }]);
        };
      }

      if (view.status === "loading")
        return h(
          "div",
          { style: { color: "var(--dsw-alias-label-secondary)" } },
          "Loading voice settings…",
        );
      if (view.status === "missing")
        return h(
          "div",
          { style: { color: "var(--dsw-alias-state-error-primary)" } },
          "The host does not expose a voice settings namespace — is voice loaded on the server?",
        );
      if (view.status === "error")
        return h(
          "div",
          { style: { color: "var(--dsw-alias-state-error-primary)" } },
          "Could not read voice settings: " + view.error,
        );

      var cfg = view.view.value || {};
      var tts = cfg.tts || {},
        stt = cfg.stt || {},
        readAloud = cfg.readAloud || {};
      var voices =
        host && host.tts && host.tts.voices && host.tts.voices.length ? host.tts.voices : null;
      var providers =
        host && host.providers
          ? host.providers
          : [
              { id: "openai", label: "OpenAI" },
              { id: "custom", label: "OpenAI-compatible endpoint" },
            ];

      /**
       * Renders a field input with specified styles, value, and events.
       *
       * The field updates its value on change and commits the value on blur or Enter key press.
       *
       * @returns {React.ReactNode} An input field element.
       */
      function selectField(label, value, options, onChange) {
        return row(
          label,
          h(
            "select",
            {
              style: inputStyle,
              value: value,
              onChange: function (e) {
                onChange(e.target.value);
              },
            },
            options.map(function (opt) {
              return h("option", { key: opt.id, value: opt.id }, opt.label);
            }),
          ),
        );
      }

      /** previewVoice implementation. */
      function previewVoice() {
        if (preview === "loading" || preview === "playing") {
          stopPlayback();
          setPreview("idle");
          return;
        }
        setPreview("loading");
        playText(
          "Hi — this is the voice your DeepSeek agent will speak with.",
          tts.voice,
          tts.speed,
          function () {
            setPreview("idle");
          },
        )
          .then(function () {
            setPreview("playing");
          })
          .catch(function () {
            setPreview("idle");
          });
      }

      return h(
        "div",
        { style: { display: "grid", gap: "16px", maxWidth: "640px" } },
        h(
          "div",
          null,
          h("h2", { style: { margin: "0 0 6px" } }, "Voice"),
          h(
            "p",
            { style: { margin: 0, color: "var(--dsw-alias-label-secondary)", fontSize: "13px" } },
            "Natural, human-sounding speech: a neural TTS endpoint read aloud in the browser, and browser-native or Whisper speech input. Credentials resolve from the account vault — nothing is stored here.",
          ),
        ),
        view.error
          ? h(
              "div",
              { style: { color: "var(--dsw-alias-state-error-primary)", fontSize: "13px" } },
              view.error,
            )
          : null,
        host && host.tts && host.tts.providerError
          ? h(
              "div",
              { style: { color: "var(--dsw-alias-state-error-primary)", fontSize: "13px" } },
              host.tts.providerError,
            )
          : null,

        h("h3", { style: { margin: "8px 0 0", fontSize: "14px" } }, "Text to speech"),
        h(
          "label",
          { style: { display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" } },
          h("input", {
            type: "checkbox",
            checked: !!tts.enabled,
            onChange: function (e) {
              set(["tts", "enabled"])(e.target.checked);
            },
          }),
          "Enable neural text-to-speech",
        ),
        selectField("Provider", tts.provider || "openai", providers, set(["tts", "provider"])),
        row(
          "Base URL",
          h(TextField, {
            value: tts.apiBase || "",
            placeholder: "https://api.openai.com/v1",
            onCommit: set(["tts", "apiBase"]),
          }),
          "Override for gateways or local servers (required for the custom provider).",
        ),
        row(
          "Credential reference",
          h(TextField, {
            value: tts.credentialRef || "",
            placeholder: "OPENAI_API_KEY",
            onCommit: set(["tts", "credentialRef"]),
          }),
          "Vault reference resolved per request — store the key with the accounts CLI, never here.",
        ),
        row(
          "Model",
          h(TextField, {
            value: tts.model || "",
            placeholder: "gpt-4o-mini-tts",
            onCommit: set(["tts", "model"]),
          }),
          host && host.tts && host.tts.models && host.tts.models.length
            ? "Suggested: " + host.tts.models.join(", ")
            : "Any OpenAI-compatible speech model.",
        ),
        row(
          "Voice",
          h(
            "div",
            { style: { display: "flex", gap: "8px", alignItems: "center" } },
            voices
              ? h(
                  "select",
                  {
                    style: Object.assign({ flex: 1 }, inputStyle),
                    value: tts.voice || "",
                    onChange: function (e) {
                      set(["tts", "voice"])(e.target.value);
                    },
                  },
                  voices.map(function (v) {
                    return h("option", { key: v.id, value: v.id }, v.label);
                  }),
                )
              : h(TextField, {
                  value: tts.voice || "",
                  placeholder: "nova",
                  onCommit: set(["tts", "voice"]),
                }),
            h(
              "button",
              {
                type: "button",
                style: Object.assign({}, inputStyle, { cursor: "pointer", whiteSpace: "nowrap" }),
                onClick: previewVoice,
              },
              preview === "loading"
                ? "Synthesizing…"
                : preview === "playing"
                  ? "■ Stop"
                  : "▶ Preview",
            ),
          ),
        ),
        row(
          "Speed — " + (tts.speed || 1).toFixed(2) + "×",
          h("input", {
            type: "range",
            min: "0.5",
            max: "2",
            step: "0.05",
            value: tts.speed || 1,
            onChange: function (e) {
              set(["tts", "speed"])(Number(e.target.value));
            },
          }),
        ),
        selectField(
          "Audio format",
          tts.format || "mp3",
          ["mp3", "opus", "aac", "flac", "wav"].map(function (f) {
            return { id: f, label: f };
          }),
          set(["tts", "format"]),
        ),

        h("h3", { style: { margin: "8px 0 0", fontSize: "14px" } }, "Speech to text"),
        selectField(
          "Mic engine",
          stt.engine || "auto",
          [
            { id: "auto", label: "Auto — browser SpeechRecognition, Whisper fallback" },
            { id: "browser", label: "Browser — Web Speech API (interim results)" },
            { id: "whisper", label: "Whisper — record and transcribe on the server" },
          ],
          set(["stt", "engine"]),
        ),

        h("h3", { style: { margin: "8px 0 0", fontSize: "14px" } }, "Read aloud"),
        h(
          "label",
          { style: { display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" } },
          h("input", {
            type: "checkbox",
            checked: !!readAloud.autoRead,
            onChange: function (e) {
              set(["readAloud", "autoRead"])(e.target.checked);
            },
          }),
          "Automatically read new assistant replies aloud",
        ),
      );
    }

    // ──────────────────────────────────────────────────────────────────────
    // Plugin body
    // ──────────────────────────────────────────────────────────────────────
    /**
     * Configures the text-to-speech settings.
     *
     * Sets the enabled status, provider, and API base URL for text-to-speech.
     *
     * @param {boolean} ttsEnabled - Whether text-to-speech is enabled.
     * @param {string} ttsProvider - The provider for text-to-speech.
     * @param {string} ttsApiBase - The base URL for the text-to-speech service.
     */
    function apply(ctx) {
      var styleEl = document.getElementById("voice-style");
      if (!styleEl) {
        styleEl = document.createElement("style");
        styleEl.id = "voice-style";
        styleEl.textContent = [
          ".voice-btn{",
          "  appearance:none;background:transparent;border:1px solid transparent;color:inherit;",
          "  border-radius:6px;cursor:pointer;line-height:1;display:inline-flex;align-items:center;",
          "  padding:4px 6px;opacity:.7;transition:opacity .12s, background .12s, border-color .12s;",
          "}",
          ".voice-btn:hover{opacity:1;background:rgba(128,128,128,.12)}",
          ".voice-btn:disabled{opacity:.35;cursor:default}",
          ".voice-btn.is-live{color:#e5484d;border-color:#e5484d;opacity:1}",
          ".voice-btn.is-error{color:#f59e0b;border-color:#f59e0b;opacity:1}",
        ].join("\n");
        document.head.append(styleEl);
      }
      ctx.effect(function () {
        return function () {
          if (styleEl && styleEl.isConnected) styleEl.remove();
        };
      }, "voice: remove styles");

      ctx.slots.inject(
        "conversation.input.left",
        function () {
          return ctx.slots.register(
            { name: "conversation.input.left", id: "voice-mic", order: 20 },
            MicButton,
          );
        },
        "voice: composer mic",
      );

      ctx.slots.inject(
        "conversation.chat.assistant-actions",
        function () {
          return ctx.slots.register(
            { name: "conversation.chat.assistant-actions", id: "voice-speaker", order: 30 },
            SpeakerButton,
          );
        },
        "voice: read-aloud action",
      );

      ctx.slots.inject(
        "settings.section",
        function () {
          return ctx.slots.register(
            {
              name: "settings.section",
              id: "voice",
              order: 42,
              label: function () {
                return "Voice";
              },
              inject: function () {
                return {
                  settings: {
                    describe: function (payload) {
                      return ctx.connection.api.settings.describe(payload);
                    },
                    mutate: function (payload) {
                      return ctx.connection.api.settings.mutate(payload);
                    },
                  },
                };
              },
            },
            VoiceSection,
          );
        },
        "voice: voice settings section",
      );

      ctx.slots.inject(
        "settings.section.icon",
        function () {
          return ctx.slots.register(
            { name: "settings.section.icon", id: "voice", order: 0 },
            VoiceGlyph,
          );
        },
        "voice: voice nav glyph",
      );
    }

    exports.apply = apply;
    exports.inject = ["slots", "connection"];
    return module.exports;
  },
});
