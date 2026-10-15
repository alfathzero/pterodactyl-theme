@extends('templates/wrapper', [
    'css' => ['body' => 'bg-neutral-800'],
])

@section('assets')
    <link rel="stylesheet" href="/assets/custom-island.css?v=7">
    <link rel="stylesheet" href="/assets/custom-anim.css?v=11">
    <link rel="stylesheet" href="/assets/custom-orb.css?v=1">
@endsection

@section('container')
    <div id="modal-portal"></div>
    <div id="app"></div>
{{-- START: SANO NEON --}}
    <script>
    document.addEventListener("DOMContentLoaded", () => {
        const username = @json(auth()->user()->username ?? 'Sayang');
        const hour = new Date().getHours();
        
        let waktu = "Malam";
        let emojiIcon = "🌃";
        let textEmoji = "😊";

        if (hour >= 4 && hour < 11) {
            waktu = "Pagi";
            emojiIcon = "🌆";
        } else if (hour >= 11 && hour < 15) {
            waktu = "Siang";
            emojiIcon = "🏙️";
        } else if (hour >= 15 && hour < 18) {
            waktu = "Sore";
            emojiIcon = "🌇";
        }

        const style = document.createElement('style');
        style.innerHTML = `
            @keyframes sanoRotate {
                0% { transform: translate(-50%, -50%) rotate(0deg); }
                100% { transform: translate(-50%, -50%) rotate(360deg); }
            }
            @keyframes sanoFloat {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-3px); }
            }
            .sano-card-wrapper {
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%) translateY(-30px);
                opacity: 0;
                width: auto;
                min-width: 280px;
                padding: 1px;
                border-radius: 12px;
                overflow: hidden;
                z-index: 99999;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
                font-family: 'Inter', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
                pointer-events: none;
                transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
            }
            .sano-neon-spinner {
                position: absolute;
                top: 50%;
                left: 50%;
                width: 600px;
                height: 600px;
                background: conic-gradient(
                    #00f2ff 0deg,
                    #00f2ff 140deg,
                    transparent 140deg,
                    transparent 180deg,
                    #00f2ff 180deg,
                    #00f2ff 320deg,
                    transparent 320deg,
                    transparent 360deg
                );
                filter: drop-shadow(0 0 5px #00f2ff);
                animation: sanoRotate 2.5s linear infinite;
            }
            .sano-card-content {
                position: relative;
                background: rgba(15, 23, 42, 0.98);
                border-radius: 10.5px;
                padding: 10px 20px;
                z-index: 2;
            }
            .sano-layout {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 20px;
            }
            .sano-text-group {
                text-align: left;
                display: flex;
                flex-direction: column;
                justify-content: center;
            }
            .sano-big-icon {
                font-size: 38px;
                line-height: 1;
                filter: drop-shadow(0 2px 5px rgba(0,0,0,0.3));
                animation: sanoFloat 2s ease-in-out infinite;
            }
        `;
        document.head.appendChild(style);

        const toast = document.createElement("div");
        toast.className = "sano-card-wrapper";
        toast.innerHTML = `
            <div class="sano-neon-spinner"></div>
            <div class="sano-card-content">
                <div class="sano-layout">
                    <div class="sano-text-group">
                        <div style="font-size: 13px; color: #cbd5e1; font-weight: 500; margin-bottom: 2px;">Hai ${username} 👋,</div>
                        <div style="font-size: 15px; color: #ffffff; font-weight: 700;">Selamat ${waktu} ${textEmoji}</div>
                    </div>
                    <div class="sano-big-icon">${emojiIcon}</div>
                </div>
            </div>
        `;
        document.body.appendChild(toast);

        requestAnimationFrame(() => {
            setTimeout(() => {
                toast.style.opacity = "1";
                toast.style.transform = "translateX(-50%) translateY(0)";
            }, 100);
        });
        setTimeout(() => {
            toast.style.opacity = "0";
            toast.style.transform = "translateX(-50%) translateY(-30px)";
        }, 4000);
        setTimeout(() => toast.remove(), 5000);
    });
    </script>
    {{-- END: SANO NEON --}}
@endsection

@section('scripts')
    @parent
    <script src="/assets/custom-island.js?v=7"></script>
    <script src="/assets/custom-stats.js?v=1"></script>
    <script src="/assets/custom-orb.js?v=1"></script>
@endsection
