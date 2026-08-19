class MidiParser {
    constructor() {
        this.midiData = null;
        this.notes = [];
        this.duration = 0;
        this.name = "";
    }

    async loadFromFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const arrayBuffer = e.target.result;
                    // Используем @tonejs/midi
                    this.midiData = new Midi(arrayBuffer);
                    this.duration = this.midiData.duration;
                    this.name = file.name;
                    
                    this.extractNotes();
                    resolve(this);
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = (err) => reject(err);
            reader.readAsArrayBuffer(file);
        });
    }

    extractNotes() {
        this.notes = [];
        this.midiData.tracks.forEach((track, trackIndex) => {
            track.notes.forEach(note => {
                this.notes.push({
                    time: note.time,             // Время старта в секундах
                    duration: note.duration,     // Длительность в секундах
                    midi: note.midi,             // Номер ноты (0-127)
                    name: note.name,             // Название (например, "C4")
                    velocity: note.velocity,     // Громкость (0 - 1)
                    track: trackIndex
                });
            });
        });

        // Сортируем ноты по времени для быстрого рендеринга
        this.notes.sort((a, b) => a.time - b.time);
    }
}