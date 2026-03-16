/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {
  Upload, Type, Trash2, Plus, Minus,
  ChevronLeft, ChevronRight, FileText, Move,
  Settings2, Zap, FileUp, Bold, Italic, Layers, Eraser, CheckCircle2, X
} from 'lucide-react';

// Setup PDF.js Worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const COLOR_PRESETS = [
  { name: 'None', value: { r: 1, g: 1, b: 1, transparent: true }, hex: 'transparent' },
  { name: 'White', value: { r: 1, g: 1, b: 1, transparent: false }, hex: '#ffffff' },
  { name: 'Yellow', value: { r: 1, g: 0.95, b: 0.2, transparent: false }, hex: '#fef08a' },
  { name: 'Blue', value: { r: 0.8, g: 0.9, b: 1, transparent: false }, hex: '#dbeafe' },
];

const FONTS = [
  { name: 'Sarabun (ไทย)', value: 'sarabun' },
  { name: 'Sans (Inter)', value: 'sans-serif' },
  { name: 'Mono (Roboto)', value: 'monospace' },
];

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [annotations, setAnnotations] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [scannedPages, setScannedPages] = useState<Set<number>>(new Set());

  const activeAnns = annotations.filter(a => selectedIds.includes(a.id));

  const onFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile?.type === 'application/pdf') {
      setIsProcessing(true);
      setFile(selectedFile);
      const pdf = await pdfjsLib.getDocument({ data: await selectedFile.arrayBuffer() }).promise;
      setPdfDoc(pdf);
      setNumPages(pdf.numPages);
      setCurrentPage(1);
      setAnnotations([]);
      setSelectedIds([]);
      setScannedPages(new Set());
      setIsProcessing(false);
    }
  };

  const scanFullPage = async () => {
    if (!pdfDoc || scannedPages.has(currentPage) || isProcessing) return;
    setIsProcessing(true);
    try {
      const page = await pdfDoc.getPage(currentPage);
      const textContent = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1 });
      const lines: any[] = [];

      textContent.items.forEach((item: any) => {
        const fontSize = Math.sqrt(item.transform[0] ** 2 + item.transform[1] ** 2);
        const y = 1 - (item.transform[5] / viewport.height);
        const x = item.transform[4] / viewport.width;

        const existingLine = lines.find(l => Math.abs(l.y - y) < 0.003);
        if (existingLine) {
          existingLine.content += (item.hasEOL ? '\n' : ' ') + item.str;
        } else {
          lines.push({
            id: Math.random().toString(36).substring(7),
            x, y,
            content: item.str,
            fontSize: fontSize,
            pageIndex: currentPage - 1,
            fontFamily: FONTS[0].value,
            bgColor: COLOR_PRESETS[0].value,
            bold: false, italic: false,
          });
        }
      });
      setAnnotations(prev => [...prev, ...lines.filter(l => l.content.trim() !== "")]);
      setScannedPages(prev => new Set(prev).add(currentPage));
    } catch (err) { console.error(err); } finally { setIsProcessing(false); }
  };

  const handlePageClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.annotation-node')) return;
    if (selectedIds.length > 0) {
      setSelectedIds([]);
      return;
    }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const newId = Math.random().toString(36).substring(7);

    setAnnotations(prev => [...prev, {
      id: newId, x, y, content: '', fontSize: 18, pageIndex: currentPage - 1,
      fontFamily: FONTS[0].value, bgColor: COLOR_PRESETS[0].value, bold: false, italic: false
    }]);
    setSelectedIds([newId]);
  };

  const updateSelected = (upd: any) => {
    setAnnotations(prev => prev.map(a => selectedIds.includes(a.id) ? { ...a, ...upd } : a));
  };

  const moveSelected = (dx: number, dy: number) => {
    setAnnotations(prev => prev.map(a => selectedIds.includes(a.id) ? { ...a, x: a.x + dx, y: a.y + dy } : a));
  };

  const handleDownload = async () => {
    if (!file) return;
    setIsProcessing(true);
    try {
      const pdfLibDoc = await PDFDocument.load(await file.arrayBuffer());
      pdfLibDoc.registerFontkit(fontkit);

      const fontCache: Record<string, any> = {};

      const getFont = async (fontFamily: string) => {
        if (fontCache[fontFamily]) return fontCache[fontFamily];

        let fontPath = './Sarabun-Regular.ttf';
        if (fontFamily === 'sans-serif') fontPath = './Inter-Regular.ttf';
        if (fontFamily === 'monospace') fontPath = './RobotoMono-Regular.ttf';

        try {
          const fontBytes = await fetch(fontPath).then(res => res.arrayBuffer());
          const embedded = await pdfLibDoc.embedFont(fontBytes);
          fontCache[fontFamily] = embedded;
          return embedded;
        } catch (err) {
          console.warn(`Font ${fontFamily} not found, using Helvetica`);
          return await pdfLibDoc.embedFont(StandardFonts.Helvetica);
        }
      };

      const pages = pdfLibDoc.getPages();
      for (const ann of annotations) {
        if (!ann.content.trim()) continue;

        const currentFont = await getFont(ann.fontFamily);
        const page = pages[ann.pageIndex];
        const { width, height } = page.getSize();
        const lines = ann.content.split('\n');
        const fSize = ann.fontSize;

        lines.forEach((line, i) => {
          const textWidth = currentFont.widthOfTextAtSize(line || ' ', fSize);
          const pdfX = ann.x * width;
          const pdfY = height - (ann.y * height) - (i * fSize * 1.1) - (fSize * 0.8);

          if (!ann.bgColor.transparent) {
            page.drawRectangle({
              x: pdfX - 2, y: pdfY - (fSize * 0.2),
              width: textWidth + 4, height: fSize * 1.2,
              color: rgb(ann.bgColor.r, ann.bgColor.g, ann.bgColor.b),
            });
          }

          page.drawText(line, {
            x: pdfX, y: pdfY,
            size: fSize,
            font: currentFont,
            color: rgb(0, 0, 0),
          });
        });
      }

      const pdfBytes = await pdfLibDoc.save();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([pdfBytes], { type: 'application/pdf' }));
      link.download = `EDITED_${file.name}`;
      link.click();
    } catch (e) {
      alert("Download error");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="h-screen bg-slate-100 flex flex-col overflow-hidden font-sans text-slate-900">
     {/* HEADER */}
<header className="h-14 bg-white border-b flex items-center justify-between px-6 z-50 shadow-sm shrink-0">
  <div className="flex items-center gap-6">
    <div className="flex items-center gap-3">
      <div className="font-black text-red-600 flex items-center gap-2 uppercase tracking-tighter text-lg italic">
        <FileText /> PDF EDITOR
      </div>
      {/* Version Tag ที่ย้ายมาฝั่งซ้าย */}
      <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md border border-slate-200">
        v2.0.2
      </span>
    </div>
    
    {file && (
      <label className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer text-xs font-bold border transition-all">
        <FileUp size={16} /> <span>OPEN NEW</span>
        <input type="file" className="hidden" accept="application/pdf" onChange={onFileChange} />
      </label>
    )}
  </div>

  {/* ฝั่งขวาคงเดิม (Pagination + Export) */}
  {file && (
    <div className="flex items-center gap-4">
      <div className="flex items-center bg-slate-100 rounded-lg p-1 border text-xs font-bold">
        <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} className="p-1 hover:text-red-600"><ChevronLeft size={18} /></button>
        <span className="px-4">{currentPage} / {numPages}</span>
        <button onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))} className="p-1 hover:text-red-600"><ChevronRight size={18} /></button>
      </div>
      <button onClick={handleDownload} disabled={isProcessing} className="bg-red-600 text-white px-5 py-2 rounded-xl font-bold text-xs hover:bg-red-700 shadow-md transition-all active:scale-95">
        {isProcessing ? 'SAVING...' : 'EXPORT PDF'}
      </button>
    </div>
  )}
</header>

      <div className="flex flex-1 overflow-hidden">
        {file && (
          <aside className="w-16 bg-white border-r flex flex-col items-center py-8 gap-5 z-40 shadow-sm">
            <button onClick={scanFullPage} title="Scan All Text" disabled={isProcessing || scannedPages.has(currentPage)} className={`p-3.5 rounded-2xl transition-all shadow-sm border ${scannedPages.has(currentPage) ? "text-slate-300 bg-slate-50 border-slate-100" : "text-blue-500 hover:bg-blue-50 border-blue-100 active:scale-90"}`}>
              {scannedPages.has(currentPage) ? <CheckCircle2 size={24} /> : <Zap size={24} />}
            </button>
            <div className="w-8 border-b border-slate-100" />
            <button
              onClick={() => setSelectedIds(annotations.filter(a => a.pageIndex === currentPage - 1).map(a => a.id))}
              title="Select All on Page"
              className="p-3.5 rounded-2xl text-slate-400 hover:bg-slate-50 transition-colors"
            >
              <Layers size={24} />
            </button>
            <button
              onClick={() => { if (confirm("Clear all text on this page?")) { setAnnotations(prev => prev.filter(a => a.pageIndex !== currentPage - 1)); setScannedPages(prev => { const n = new Set(prev); n.delete(currentPage); return n; }); setSelectedIds([]); } }}
              title="Delete All on Page"
              className="p-3.5 rounded-2xl text-red-400 hover:bg-red-50 transition-colors"
            >
              <Eraser size={24} />
            </button>
          </aside>
        )}

        <main className="flex-1 overflow-auto bg-slate-200 p-10 flex flex-col items-center relative">
          {!file ? (
            <label className="m-auto bg-white p-24 rounded-[3rem] shadow-2xl border-4 border-dashed border-slate-200 flex flex-col items-center cursor-pointer hover:border-red-400 group transition-all">
              <Upload className="text-slate-300 mb-6 group-hover:text-red-400" size={48} />
              <input type="file" className="hidden" accept="application/pdf" onChange={onFileChange} />
              <span className="font-black text-slate-400 uppercase tracking-widest">UPLOAD PDF</span>
            </label>
          ) : (
            <div className="pdf-viewport-container relative shadow-2xl bg-white origin-top mb-32" style={{ transform: `scale(${scale})` }} onClick={handlePageClick}>
              <PDFPageRenderer pdfDoc={pdfDoc} pageNumber={currentPage} />
              <div className="absolute inset-0 pointer-events-none z-30">
                {annotations.filter(a => a.pageIndex === currentPage - 1).map(ann => (
                  <AnnotationItem key={ann.id} annotation={ann} selected={selectedIds.includes(ann.id)}
                    onSelect={(multi) => multi ? setSelectedIds(prev => prev.includes(ann.id) ? prev.filter(i => i !== ann.id) : [...prev, ann.id]) : setSelectedIds([ann.id])}
                    onUpdate={(upd: any) => setAnnotations(prev => prev.map(a => a.id === ann.id ? { ...a, ...upd } : a))}
                    onMove={moveSelected} onDelete={() => { setAnnotations(prev => prev.filter(a => a.id !== ann.id)); setSelectedIds([]); }}
                  />
                ))}
              </div>
            </div>
          )}
        </main>

        {file && (
          <aside className="w-80 bg-white border-l flex flex-col shadow-2xl z-50 p-6 overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-4 mb-6">
              <div className="flex items-center gap-2 font-black text-[10px] text-red-600 uppercase tracking-widest"><Settings2 size={16} /> PROPERTIES</div>
              {selectedIds.length > 0 && (
                <button onClick={() => setSelectedIds([])} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
              )}
            </div>

            <div className={`space-y-6 ${selectedIds.length === 0 ? "opacity-30 pointer-events-none" : ""}`}>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase">Typography</label>
                <div className="flex gap-2">
                  <button onClick={() => updateSelected({ bold: !activeAnns[0]?.bold })} className={`flex-1 py-2 border rounded-xl transition-all ${activeAnns[0]?.bold ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-400 border-slate-100'}`}><Bold size={16} className="mx-auto" /></button>
                  <button onClick={() => updateSelected({ italic: !activeAnns[0]?.italic })} className={`flex-1 py-2 border rounded-xl transition-all ${activeAnns[0]?.italic ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-400 border-slate-100'}`}><Italic size={16} className="mx-auto" /></button>
                </div>
                <select value={activeAnns[0]?.fontFamily} onChange={(e) => updateSelected({ fontFamily: e.target.value })} className="w-full p-2 border rounded-xl bg-slate-50 text-sm font-bold outline-none mt-2">
                  {FONTS.map(f => <option key={f.name} value={f.value}>{f.name}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase">Font Size ({Math.round(activeAnns[0]?.fontSize || 0)}px)</label>
                <input type="range" min="4" max="150" value={activeAnns[0]?.fontSize || 14} onChange={(e) => updateSelected({ fontSize: parseInt(e.target.value) })} className="w-full accent-red-600" />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase">Background</label>
                <div className="grid grid-cols-4 gap-2">
                  {COLOR_PRESETS.map(c => (
                    <button key={c.name} onClick={() => updateSelected({ bgColor: c.value })} className={`aspect-square rounded-xl border-2 transition-all ${activeAnns[0]?.bgColor?.hex === c.hex ? "border-red-500 scale-105" : "border-transparent"}`} style={{ backgroundColor: c.hex === 'transparent' ? '#f1f5f9' : c.hex }} />
                  ))}
                </div>
              </div>

              {selectedIds.length === 1 && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase">Text Editor</label>
                  <textarea value={activeAnns[0]?.content || ""} onChange={(e) => updateSelected({ content: e.target.value })} className="w-full p-4 bg-slate-50 border rounded-2xl text-sm min-h-[120px] outline-none font-medium" />
                </div>
              )}

              <button onClick={() => { setAnnotations(prev => prev.filter(a => !selectedIds.includes(a.id))); setSelectedIds([]); }} className="w-full py-4 bg-red-50 text-red-600 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-red-100 transition-colors">
                Remove Selected ({selectedIds.length})
              </button>
            </div>
          </aside>
        )}
      </div>

      {file && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white px-5 py-2.5 rounded-2xl shadow-2xl border flex items-center gap-6 z-50">
          <button onClick={() => setScale(s => Math.max(0.1, s - 0.1))} className="p-1 hover:bg-slate-100 rounded-lg"><Minus size={18} /></button>
          <span className="text-xs font-black w-12 text-center">{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale(s => Math.min(5, s + 0.1))} className="p-1 hover:bg-slate-100 rounded-lg"><Plus size={18} /></button>
        </div>
      )}
    </div>
  );
}

function PDFPageRenderer({ pdfDoc, pageNumber }: any) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!pdfDoc) return;
    const render = async () => {
      const page = await pdfDoc.getPage(pageNumber);
      const vp = page.getViewport({ scale: 2 });
      const canvas = canvasRef.current!;
      canvas.width = vp.width; canvas.height = vp.height;
      await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise;
    };
    render();
  }, [pdfDoc, pageNumber]);
  return <canvas ref={canvasRef} className="block w-full h-auto" />;
}

function AnnotationItem({ annotation, selected, onSelect, onUpdate, onMove, onDelete }: any) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [dragStart, setDragStart] = useState<{ x: number, y: number } | null>(null);

  useEffect(() => { if (selected) inputRef.current?.focus(); }, [selected]);

  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.style.width = '10px';
      el.style.height = 'auto';
      const buffer = annotation.fontSize * 0.4;
      el.style.width = `${el.scrollWidth + buffer}px`;
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [annotation.content, annotation.fontSize, annotation.bold, annotation.fontFamily]);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!dragStart) return;
      const container = document.querySelector('.pdf-viewport-container')?.getBoundingClientRect();
      if (container) {
        onMove((e.clientX - dragStart.x) / container.width, (e.clientY - dragStart.y) / container.height);
        setDragStart({ x: e.clientX, y: e.clientY });
      }
    };
    const handleUp = () => setDragStart(null);
    if (dragStart) { window.addEventListener('mousemove', handleMove); window.addEventListener('mouseup', handleUp); }
    return () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp); };
  }, [dragStart, onMove]);

  const bgColorStyle = annotation.bgColor.transparent ? 'transparent' : `rgb(${annotation.bgColor.r * 255}, ${annotation.bgColor.g * 255}, ${annotation.bgColor.b * 255})`;

  return (
    <div onMouseDown={(e) => { e.stopPropagation(); onSelect(e.ctrlKey || e.metaKey); }}
      className="absolute pointer-events-auto annotation-node flex items-start"
      style={{ left: `${annotation.x * 100}%`, top: `${annotation.y * 100}%`, zIndex: selected ? 100 : 10 }}
    >
      {selected && (
        <div onMouseDown={(e) => { e.stopPropagation(); setDragStart({ x: e.clientX, y: e.clientY }); }} className="absolute -left-10 p-2 bg-red-600 text-white rounded-xl cursor-move shadow-xl z-50 active:scale-95 transition-transform">
          <Move size={16} />
        </div>
      )}
      <div className={`p-0.5 rounded transition-all flex items-center ${selected ? "ring-2 ring-red-500 shadow-md" : ""}`} style={{ backgroundColor: bgColorStyle }}>
        <textarea
          ref={inputRef}
          value={annotation.content}
          rows={1}
          spellCheck={false}
          onChange={(e) => onUpdate({ content: e.target.value })}
          onBlur={() => annotation.content.trim() === "" && !selected && onDelete()}
          className="bg-transparent outline-none border-none p-0 m-0 resize-none overflow-hidden block placeholder-slate-300"
          placeholder={selected ? "Type here..." : ""}
          style={{
            display: 'block',
            whiteSpace: 'pre',
            fontSize: `${annotation.fontSize * 2}px`,
            fontFamily: annotation.fontFamily === 'sarabun' ? '"TH Sarabun New", sans-serif' : 
                        annotation.fontFamily === 'monospace' ? 'ui-monospace, monospace' : 'ui-sans-serif, sans-serif',
            fontWeight: annotation.bold ? 'bold' : 'normal',
            fontStyle: annotation.italic ? 'italic' : 'normal',
            color: 'black',
            lineHeight: '1.2',
            minWidth: '1ch',
            paddingRight: '4px'
          } as React.CSSProperties}
        />
      </div>
    </div>
  );
}