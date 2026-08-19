document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('pfa-canvas');
    const ctx = canvas.getContext('2d');
    const dropOverlay = document.getElementById('drop-zone-overlay');
    const fileInput = document.getElementById('midi-file-input');
    const trackInfo = document.getElementById('track-info');
    const statusFps = document.getElementById('status-fps');
    const statusTime = document.getElementById('status-time');
    const statusNotes = document.getElementById('status-notes');

    const keyboardContainer = document.getElementById('keyboard-container');
    
    let midiParser = new MidiParser();
    let synth = null;
    let isPlaying = false;
    let startTime = 0;
    let pauseOffset = 0;
    let animationFrameId = null;
    let fpsCounter = 0;
    let lastFpsUpdate = performance.now();

    // Инициализация звукового синтезатора (PolySynth под рояль)
    function initSynth() {
        if (!synth) {
            synth = new Tone.PolySynth(Tone.Synth, {
                oscillator: { type: "triangle8" },
                envelope: {
                    attack: 0.005,
                    decay: 0.1,
                    sustain: 0.3,
                    release: 1
                }
            }).toDestination();
        }
    }

    // Инициализация физической MIDI-клавиатуры через наш обновленный модуль
    const keyboard = new VirtualKeyboard(
        keyboardContainer,
        (midiNote, velocity) => {
            // Callback: Нажатие клавиши на реальном USB-синтезаторе
            initSynth();
            Tone.start();
            const noteName = Tone.Frequency(midiNote, "midi").toNote();
            synth.triggerAttack(noteName, undefined, velocity);
        },
        (midiNote) => {
            // Callback: Отпускание клавиши на реальном USB-синтезаторе
            if (synth) {
                const noteName = Tone.Frequency(midiNote, "midi").toNote();
                synth.triggerRelease(noteName);
            }
        }
    );

    // Настройка размеров Canvas
    function resizeCanvas() {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
    }
    window.addEventListener('resize', () => {
        resizeCanvas();
        keyboard.initKeysUI(); // Пересчитываем размеры клавиш на панели при редизайне
    });
    resizeCanvas();

    // Загрузка файла
    async function loadMidiFile(file) {
        try {
            trackInfo.textContent = `Загрузка ${file.name}...`;
            await midiParser.loadFromFile(file);
            trackInfo.textContent = `Трек: ${midiParser.name} (${Math.round(midiParser.duration)} сек)`;
            dropOverlay.classList.add('hidden');
            stopPlayback();
        } catch (e) {
            alert('Ошибка при чтении MIDI файла: ' + e.message);
            trackInfo.textContent = 'Ошибка загрузки файла.';
        }
    }

    // События выбора файла
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            loadMidiFile(e.target.files.length > 0 ? e.target.files[0] : null);
        }
    });

    // Drag & Drop
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length > 0) {
            loadMidiFile(e.dataTransfer.files[0]);
        }
    });

    // Управление воспроизведением
    document.getElementById('btn-play').addEventListener('click', async () => {
        if (!midiParser.notes.length) return;
        await Tone.start();
        initSynth();

        if (!isPlaying) {
            isPlaying = true;
            startTime = Tone.now() - pauseOffset;
            Tone.Transport.start();
            requestAnimationFrame(renderLoop);
        }
    });

    document.getElementById('btn-pause').addEventListener('click', () => {
        if (isPlaying) {
            isPlaying = false;
            pauseOffset = Tone.now() - startTime;
            Tone.Transport.pause();
            if (synth) synth.releaseAll();
            cancelAnimationFrame(animationFrameId);
        }
    });

    document.getElementById('btn-stop').addEventListener('click', () => {
        stopPlayback();
    });

    function stopPlayback() {
        isPlaying = false;
        pauseOffset = 0;
        Tone.Transport.stop();
        if (synth) synth.releaseAll();
        cancelAnimationFrame(animationFrameId);
        render(0); // Отрисовка пустого кадра
        updateStatus(0, 0);
    }

    // Главный цикл рендеринга и воспроизведения
    function renderLoop() {
        if (!isPlaying) return;

        const currentTime = Tone.now() - startTime;

        if (currentTime > midiParser.duration) {
            stopPlayback();
            return;
        }

        render(currentTime);
        scheduleAudio(currentTime);
        updateStatus(currentTime, midiParser.duration);

        // Расчет FPS
        fpsCounter++;
        const now = performance.now();
        if (now - lastFpsUpdate >= 1000) {
            statusFps.textContent = `FPS: ${fpsCounter}`;
            fpsCounter = 0;
            lastFpsUpdate = now;
        }

        animationFrameId = requestAnimationFrame(renderLoop);
    }

    // Рендер падающих нот на Canvas
    function render(currentTime) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const fallSpeed = 250; // Пикселей в секунду
        const hitLineY = canvas.height - 10; // Линия клавиатуры
        const activeNotesCount = [];

        // Классическая палитра цветов для треков
        const trackColors = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c'];

        midiParser.notes.forEach(note => {
            const timeToHit = note.time - currentTime;
            const y = hitLineY - (timeToHit * fallSpeed) - (note.duration * fallSpeed);
            const height = note.duration * fallSpeed;

            if (y + height < 0 || y > canvas.height) return;

            const x = getNoteX(note.midi, canvas.width);
            const width = getNoteWidth(note.midi, canvas.width);

            // Если нота пересекает линию удара — подсвечиваем клавишу на экране
            if (timeToHit <= 0 && timeToHit + note.duration >= 0) {
                activeNotesCount.push(note.midi);
                keyboard.setKeyPressed(note.midi, true);
            } else {
                // Выключаем только если физически с синтезера эта клавиша сейчас не зажата
                // (метод setKeyPressed в классе просто управляет классами)
                keyboard.setKeyPressed(note.midi, false);
            }

            // Рисуем блок ноты
            ctx.fillStyle = trackColors[note.track % trackColors.length];
            ctx.fillRect(x, y, width, Math.max(height, 3));

            // Четкая ретро-обводка
            ctx.strokeStyle = '#222';
            ctx.strokeRect(x, y, width, Math.max(height, 3));
        });

        statusNotes.textContent = `Активных нот: ${activeNotesCount.length}`;
    }

    function getNoteX(midiNote, totalWidth) {
        const startNote = 21;
        const endNote = 108;
        const totalKeys = endNote - startNote + 1;
        const keyWidth = totalWidth / totalKeys;
        return (midiNote - startNote) * keyWidth;
    }

    function getNoteWidth(midiNote, totalWidth) {
        const startNote = 21;
        const endNote = 108;
        const totalKeys = endNote - startNote + 1;
        return (totalWidth / totalKeys) - 1;
    }

    // Авто-проигрывание нот из MIDI-файла
    function scheduleAudio(currentTime) {
        midiParser.notes.forEach(note => {
            if (note.time >= currentTime && note.time < currentTime + 0.05) {
                if (synth) {
                    synth.triggerAttackRelease(note.name, note.duration, undefined, note.velocity);
                }
            }
        });
    }

    function updateStatus(current, total) {
        const fmt = (sec) => {
            const m = Math.floor(sec / 60);
            const s = Math.floor(sec % 60);
            return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        };
        statusTime.textContent = `${fmt(current)} / ${fmt(total)}`;
    }

    // Первичный пустой кадр
    render(0);
});