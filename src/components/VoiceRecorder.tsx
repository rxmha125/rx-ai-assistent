import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, AudioWaveform as Waveform, Volume2, VolumeX } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface VoiceRecorderProps {
  onRecordingComplete: (text: string) => void;
  onInputChange: (text: string) => void;
}

export function VoiceRecorder({ onRecordingComplete, onInputChange }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [volume, setVolume] = useState(0);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const SILENCE_THRESHOLD = 2000; // 2 seconds of silence before auto-stopping
  const MAX_RECORDING_DURATION = 60000; // 60 seconds max recording

  useEffect(() => {
    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US'; // Set language

      recognitionRef.current.onresult = (event) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        const currentTranscript = finalTranscript || interimTranscript;
        setTranscript(currentTranscript);
        onInputChange(currentTranscript);
        
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
        }
        silenceTimeoutRef.current = setTimeout(() => {
          if (currentTranscript.trim()) {
            stopRecording();
          }
        }, SILENCE_THRESHOLD);
      };

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'no-speech') {
          stopRecording();
        }
      };

      recognitionRef.current.onend = () => {
        if (isRecording) {
          recognitionRef.current?.start();
        }
      };
    }

    return () => {
      cleanup();
    };
  }, [onInputChange, isRecording]);

  useEffect(() => {
    if (isRecording) {
      const startTime = Date.now();
      durationIntervalRef.current = setInterval(() => {
        const duration = Date.now() - startTime;
        setRecordingDuration(duration);
        
        if (duration >= MAX_RECORDING_DURATION) {
          stopRecording();
        }
      }, 100);
    }

    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  }, [isRecording]);

  const cleanup = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
    setRecordingDuration(0);
  };

  const analyzeAudio = () => {
    if (!analyserRef.current || !dataArrayRef.current) return;

    const checkAudioLevel = () => {
      analyserRef.current!.getByteFrequencyData(dataArrayRef.current!);
      const average = dataArrayRef.current!.reduce((a, b) => a + b) / dataArrayRef.current!.length;
      const normalizedVolume = Math.min(average / 128, 1);
      setVolume(normalizedVolume);
      setIsSpeaking(normalizedVolume > 0.15);

      animationFrameRef.current = requestAnimationFrame(checkAudioLevel);
    };

    checkAudioLevel();
  };

  const startRecording = async () => {
    try {
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        await audioContextRef.current.close();
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      analyserRef.current.fftSize = 256;
      dataArrayRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyzeAudio();

      mediaRecorder.ondataavailable = (e) => {
        chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        cleanup();
      };

      mediaRecorder.start(100);
      if (recognitionRef.current) {
        recognitionRef.current.start();
      }
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      cleanup();
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
      }
      setIsRecording(false);
      setIsSpeaking(false);
      if (transcript.trim()) {
        onRecordingComplete(transcript);
      }
      setTranscript('');
    }
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <motion.div 
      className="flex items-center gap-2 relative"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <AnimatePresence>
        {isRecording && (
          <>
            <motion.div
              className="absolute -inset-2 rounded-full bg-gradient-to-r from-blue-500/20 to-purple-500/20"
              initial={{ scale: 1, opacity: 0 }}
              animate={{ 
                scale: [1, 1.2, 1],
                opacity: [0.2, 0.4, 0.2]
              }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />
            <motion.div
              className="absolute -inset-2 rounded-full"
              style={{
                background: `radial-gradient(circle, ${
                  isSpeaking ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'
                } 0%, transparent 70%)`
              }}
              initial={{ scale: 1 }}
              animate={{ 
                scale: isSpeaking ? [1, 1.4, 1] : 1,
              }}
              transition={{
                duration: 0.8,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />
          </>
        )}
      </AnimatePresence>

      <div className="relative">
        {isRecording ? (
          <motion.button
            onClick={stopRecording}
            className={`p-2 rounded-full ${
              isSpeaking ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'
            } text-white relative z-10`}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <Square className="w-5 h-5" />
          </motion.button>
        ) : (
          <motion.button
            onClick={startRecording}
            className="p-2 rounded-full bg-blue-500 hover:bg-blue-600 text-white relative z-10"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <Mic className="w-5 h-5" />
          </motion.button>
        )}

        {isRecording && (
          <motion.div
            className="absolute left-full ml-2 flex items-center gap-2 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full shadow-sm"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <span className="text-sm font-medium text-blue-700">
              {formatDuration(recordingDuration)}
            </span>
            {isSpeaking ? (
              <Volume2 className="w-4 h-4 text-green-500" />
            ) : (
              <VolumeX className="w-4 h-4 text-red-500" />
            )}
            <motion.div 
              className="flex gap-0.5 items-end h-4"
              initial={false}
            >
              {[...Array(5)].map((_, i) => (
                <motion.div
                  key={i}
                  className="w-1 bg-blue-500"
                  animate={{
                    height: volume * 16 * (i + 1) / 5,
                  }}
                  transition={{
                    type: "spring",
                    stiffness: 300,
                    damping: 20
                  }}
                  style={{
                    minHeight: 2
                  }}
                />
              ))}
            </motion.div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}