'use client';
import { toast } from './Toaster';


import React, { useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';

interface SignaturePadProps {
    onSave: (signatureDataUrl: string) => void;
    onCancel?: () => void;
    title?: string;
    description?: string;
}

export function SignaturePad({ 
    onSave, 
    onCancel, 
    title = "Digital Signature", 
    description = "Please use your finger or mouse to sign in the box below." 
}: SignaturePadProps) {
    const sigCanvas = useRef<SignatureCanvas>(null);
    const [isEmpty, setIsEmpty] = useState(true);

    const clear = () => {
        sigCanvas.current?.clear();
        setIsEmpty(true);
    };

    const save = () => {
        if (sigCanvas.current?.isEmpty()) {
            toast.error("Please provide a signature first.");
            return;
        }
        
        // Get signature as PNG Data URL
        const dataUrl = sigCanvas.current?.getTrimmedCanvas().toDataURL('image/png');
        if (dataUrl) {
            onSave(dataUrl);
        }
    };

    return (
        <div className="bg-zeno-navy/40 backdrop-blur-md p-6 rounded-2xl border border-white/10 shadow-2xl max-w-lg w-full mx-auto">
            <div className="mb-6">
                <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
                <p className="text-gray-400 text-sm">{description}</p>
            </div>

            <div className="bg-white rounded-xl overflow-hidden mb-6 border-2 border-zeno-cyan/30">
                <SignatureCanvas 
                    ref={sigCanvas}
                    penColor="#052244" // Navy blue pen
                    canvasProps={{
                        className: "signature-canvas w-full h-64 cursor-crosshair",
                        style: { width: '100%', height: '256px' }
                    }}
                    onBegin={() => setIsEmpty(false)}
                />
            </div>

            <div className="flex gap-3">
                <button 
                    onClick={clear}
                    className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg transition-all border border-white/10 font-medium"
                >
                    Clear
                </button>
                <button 
                    onClick={save}
                    disabled={isEmpty}
                    className={`flex-1 px-4 py-2 rounded-lg font-bold transition-all shadow-lg ${
                        isEmpty 
                        ? 'bg-gray-600 text-gray-400 cursor-not-allowed' 
                        : 'bg-zeno-cyan text-zeno-navy hover:bg-cyan-400 shadow-cyan-500/20'
                    }`}
                >
                    Save Signature
                </button>
                {onCancel && (
                    <button 
                        onClick={onCancel}
                        className="px-4 py-2 text-gray-400 hover:text-white transition-all"
                    >
                        Cancel
                    </button>
                )}
            </div>
        </div>
    );
}
