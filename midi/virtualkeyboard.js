class VirtualKeyboard {
    constructor(containerElement, onNoteOn, onNoteOff) {
        this.container = containerElement;
        this.keys = {};
        this.onNoteOn = onNoteOn;
        this.onNoteOff = onNoteOff;
        
        this.initKeysUI();
        this.initWebMidi();
    }

    // Создаем визуальные 88 клавиш на нижней панели (чтобы видеть нажатия с физической клавы)
    initKeysUI() {
        this.container.innerHTML = '';
        
        const startNote = 21; // A0
        const endNote = 108;  // C8
        
        let whiteKeyCount = 0;
        for (let i = startNote; i <= endNote; i++) {
            if (!this.isBlackKey(i)) whiteKeyCount++;
        }

        let currentWhiteIndex = 0;
        const containerWidth = this.container.clientWidth || 958;

        for (let midiNote = startNote; midiNote <= endNote; midiNote++) {
            const isBlack = this.isBlackKey(midiNote);
            const keyEl = document.createElement('div');
            keyEl.className = `piano-key ${isBlack ? 'black' : 'white'}`;
            keyEl.dataset.note = midiNote;

            if (!isBlack) {
                keyEl.style.left = `${(currentWhiteIndex * 100) / whiteKeyCount}%`;
                keyEl.style.width = `${100 / whiteKeyCount}%`;
                currentWhiteIndex++;
            } else {
                const prevWhiteLeft = ((currentWhiteIndex - 1) * 100) / whiteKeyCount;
                keyEl.style.left = `${prevWhiteLeft + (100 / whiteKeyCount) * 0.7}%`;
                keyEl.style.zIndex = '3';
            }

            this.container.appendChild(keyEl);
            this.keys[midiNote] = keyEl;
        }
    }

    isBlackKey(midiNote) {
        return [1, 3, 6, 8, 10].includes(midiNote % 12);
    }

    // Подключение к реальной физической MIDI-клавиатуре через браузер
    async initWebMidi() {
        if (!navigator.requestMIDIAccess) {
            console.warn("Web MIDI API не поддерживается вашим браузером.");
            return;
        }

        try {
            const midiAccess = await navigator.requestMIDIAccess();
            console.log("MIDI доступ успешно получен!");

            // Проверяем подключенные устройства
            this.updateMidiInputs(midiAccess);
            
            // Следим за подключением/отключением устройств на лету
            midiAccess.onstatechange = (e) => this.updateMidiInputs(midiAccess);

        } catch (err) {
            console.error("Не удалось получить доступ к MIDI устройствам:", err);
        }
    }

    updateMidiInputs(midiAccess) {
        let inputs = midiAccess.inputs.values();
        let connectedCount = 0;

        for (let input of inputs) {
            connectedCount++;
            // Вешаем обработчик сообщений на каждое найденное MIDI-устройство
            input.onmidimessage = (msg) => this.handleMidiMessage(msg);
            console.log(`Подключено MIDI устройство: ${input.name} (${input.manufacturer})`);
        }

        if (connectedCount === 0) {
            console.log("MIDI-клавиатуры не обнаружены. Подключите устройство через USB.");
        }
    }

    // Обработка сырых MIDI сообщений (Note On / Note Off)
    handleMidiMessage(event) {
        const [status, note, velocity] = event.data;
        const command = status >> 4; // Старшие 4 бита — тип команды (9 = Note On, 8 = Note Off)
        
        // Команда 9 (Note On) с velocity > 0
        if (command === 9 && velocity > 0) {
            this.setKeyPressed(note, true);
            if (this.onNoteOn) this.onNoteOn(note, velocity / 127);
        } 
        // Команда 8 (Note Off) или Note On с velocity = 0
        else if (command === 8 || (command === 9 && velocity === 0)) {
            this.setKeyPressed(note, false);
            if (this.onNoteOff) this.onNoteOff(note);
        }
    }

    // Подсветка клавиши в интерфейсе
    setKeyPressed(midiNote, active) {
        const key = this.keys[midiNote];
        if (key) {
            if (active) {
                key.classList.add('active');
            } else {
                key.classList.remove('active');
            }
        }
    }
}