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
  Settings2, Zap, FileUp, Bold, Italic, Layers, Eraser, CheckCircle2, X, Download, MousePointer2, Settings
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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

const TEXT_COLORS = [
  { name: 'Black', value: { r: 0, g: 0, b: 0 }, hex: '#000000' },
  { name: 'Red', value: { r: 0.8, g: 0, b: 0 }, hex: '#ef4444' },
  { name: 'Blue', value: { r: 0, g: 0.2, b: 0.8 }, hex: '#3b82f6' },
  { name: 'Green', value: { r: 0, g: 0.5, b: 0 }, hex: '#22c55e' },
];

const detectFontFamily = (pdfFontName: string = '') => {
  const name = pdfFontName.toLowerCase();
  if (name.includes('sarabun') || name.includes('thsarabun') || name.includes('thai') || name.includes('angsana') || name.includes('cordia')) {
    return 'sarabun';
  }
  if (name.includes('mono') || name.includes('courier') || name.includes('consolas')) {
    return 'monospace';
  }
  return 'sans-serif';
};

const ToolButton = ({ icon, onClick, title, active, disabled, color = "text-slate-600", bg = "hover:bg-slate-50" }: any) => (
  <motion.button
    whileHover={{ scale: 1.1 }}
    whileTap={{ scale: 0.9 }}
    onClick={onClick}
    title={title}
    disabled={disabled}
    className={`p-3 rounded-2xl transition-all shadow-sm border border-transparent ${disabled ? 'opacity-30 cursor-not-allowed' : `${bg} ${color} border-slate-100`}`}
  >
    {icon}
  </motion.button>
);

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
  const [selectionBox, setSelectionBox] = useState<{startX: number, startY: number, endX: number, endY: number} | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [pageAspectRatio, setPageAspectRatio] = useState(1);
  const [pdfPageWidth, setPdfPageWidth] = useState(595.276); // Default A4 width in pts
  const [viewScale, setViewScale] = useState(1);
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateScale = () => {
      if (viewportRef.current && pdfPageWidth) {
        setViewScale(viewportRef.current.offsetWidth / pdfPageWidth);
      }
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [pdfPageWidth]);

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
      
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1 });
      setPageAspectRatio(viewport.width / viewport.height);
      setPdfPageWidth(viewport.width);

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
        const fontSize = Math.sqrt(item.transform[0] ** 2 + item.transform[1] ** 2) || 14;
        const fontName = item.fontName;
        const style = textContent.styles[fontName];
        const fontFamily = detectFontFamily(style?.fontFamily || '');
        
        const yTop = 1 - ((item.transform[5] + fontSize * 0.8) / viewport.height);
        const x = item.transform[4] / viewport.width;

        const existingLine = lines.find(l => Math.abs(l.y - yTop) < 0.005);
        if (existingLine) {
          existingLine.content += (item.hasEOL ? '\n' : ' ') + item.str;
        } else {
          lines.push({
            id: Math.random().toString(36).substring(7),
            x, y: yTop,
            content: item.str,
            fontSize: fontSize,
            pageIndex: currentPage - 1,
            fontFamily: fontFamily,
            bgColor: COLOR_PRESETS[0].value,
            bold: false, italic: false,
            textColor: TEXT_COLORS[0].value,
          });
        }
      });
      setAnnotations(prev => [...prev, ...lines.filter(l => l.content.trim() !== "")]);
      setScannedPages(prev => new Set(prev).add(currentPage));
    } catch (err) { console.error(err); } finally { setIsProcessing(false); }
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

        let fontPath = '/THSarabunNew.ttf';
        if (fontFamily === 'sans-serif') fontPath = '/Inter-Regular.ttf';
        if (fontFamily === 'monospace') fontPath = '/RobotoMono-Regular.ttf';

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
      const hasThai = (text: string) => /[\u0E00-\u0E7F]/.test(text);

      for (const ann of annotations) {
        if (!ann.content.trim()) continue;

        const useFontFamily = hasThai(ann.content) ? 'sarabun' : ann.fontFamily;
        const currentFont = await getFont(useFontFamily);
        const page = pages[ann.pageIndex];
        const { width, height } = page.getSize();
        const lines = ann.content.split('\n');
        const fSize = ann.fontSize;

        lines.forEach((line, i) => {
          const textWidth = currentFont.widthOfTextAtSize(line || ' ', fSize);
          const pdfX = ann.x * width;
          const pdfY = height - (ann.y * height) - (i * fSize * 1.2) - (fSize * 0.85); // Adjusted baseline offset

          if (!ann.bgColor.transparent) {
            // Match browser's appearance: centered vertically in 1.2 line-height
            page.drawRectangle({
              x: pdfX - 2, 
              y: pdfY - (fSize * 0.25), // Adjusted for 1.2 line height
              width: textWidth + 4, 
              height: fSize * 1.2,
              color: rgb(ann.bgColor.r, ann.bgColor.g, ann.bgColor.b),
            });
          }

          page.drawText(line, {
            x: pdfX, y: pdfY,
            size: fSize,
            font: currentFont,
            color: rgb(ann.textColor.r, ann.textColor.g, ann.textColor.b),
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
    <div className="h-screen bg-slate-100 flex flex-col overflow-hidden font-sans text-slate-900 selection:bg-red-100">
      {/* GLOW EFFECTS */}
      <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-red-400/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-400/5 blur-[120px] rounded-full pointer-events-none" />

      {/* HEADER */}
      <header className="h-16 glass border-b flex items-center justify-between px-8 z-50 shadow-sm shrink-0">
        <div className="flex items-center gap-8">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3"
          >
            <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-red-200">
              <FileText size={22} />
            </div>
            <div>
              <div className="font-black text-slate-900 uppercase tracking-tight text-lg leading-none">PDF MASTER</div>
              <div className="text-[10px] font-bold text-slate-400 tracking-widest mt-0.5">V2.1.0 PROFESSIONNAL</div>
            </div>
          </motion.div>

          {file && (
            <motion.label 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 text-slate-600 rounded-xl cursor-pointer text-xs font-bold border border-slate-200 transition-all shadow-sm"
            >
              <FileUp size={16} /> <span>OPEN NEW</span>
              <input type="file" className="hidden" accept="application/pdf" onChange={onFileChange} />
            </motion.label>
          )}
        </div>

        {file && (
          <div className="flex items-center gap-6">
            <div className="flex items-center bg-slate-100/50 backdrop-blur-md rounded-xl p-1 border border-slate-200 text-xs font-bold transition-all">
              <button 
                onClick={async () => {
                  const next = Math.max(1, currentPage - 1);
                  if (next !== currentPage && pdfDoc) {
                    const page = await pdfDoc.getPage(next);
                    const vp = page.getViewport({ scale: 1 });
                    setPageAspectRatio(vp.width / vp.height);
                    setPdfPageWidth(vp.width);
                    setCurrentPage(next);
                  }
                }} 
                className="p-2 hover:bg-white hover:text-red-600 rounded-lg transition-all"
              >
                <ChevronLeft size={20} />
              </button>
              <span className="px-6 tabular-nums">{currentPage} / {numPages}</span>
              <button 
                onClick={async () => {
                  const next = Math.min(numPages, currentPage + 1);
                  if (next !== currentPage && pdfDoc) {
                    const page = await pdfDoc.getPage(next);
                    const vp = page.getViewport({ scale: 1 });
                    setPageAspectRatio(vp.width / vp.height);
                    setPdfPageWidth(vp.width);
                    setCurrentPage(next);
                  }
                }} 
                className="p-2 hover:bg-white hover:text-red-600 rounded-lg transition-all"
              >
                <ChevronRight size={20} />
              </button>
            </div>
            
            <motion.button 
              whileHover={{ scale: 1.02, translateY: -1 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleDownload} 
              disabled={isProcessing} 
              className="bg-slate-900 text-white px-6 py-2.5 rounded-xl font-bold text-xs hover:bg-black shadow-xl shadow-slate-200 transition-all flex items-center gap-2"
            >
              {isProcessing ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : <Download size={16} />}
              {isProcessing ? 'SAVING...' : 'EXPORT PDF'}
            </motion.button>
          </div>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {file && (
          <motion.aside 
            initial={{ x: -80 }}
            animate={{ x: 0 }}
            className="w-20 glass border-r flex flex-col items-center py-6 gap-6 z-40 shadow-sm"
          >
            <div className="text-[10px] font-black text-slate-300 uppercase vertical-text mb-2 origin-center rotate-180" style={{ writingMode: 'vertical-rl' }}>Toolbar</div>
            
            <ToolButton 
              active={false} 
              onClick={scanFullPage} 
              title="Auto-Scan Text" 
              disabled={isProcessing || scannedPages.has(currentPage)}
              icon={scannedPages.has(currentPage) ? <CheckCircle2 size={22} /> : <Zap size={22} />}
              color={scannedPages.has(currentPage) ? "text-green-500" : "text-blue-500"}
              bg={scannedPages.has(currentPage) ? "bg-green-50" : "bg-blue-50"}
            />

            <ToolButton 
              onClick={() => setSelectedIds(annotations.filter(a => a.pageIndex === currentPage - 1).map(a => a.id))}
              title="Select All"
              icon={<Layers size={22} />}
              color="text-slate-500"
            />

            <ToolButton 
              onClick={() => { if (confirm("Clear all text on this page?")) { setAnnotations(prev => prev.filter(a => a.pageIndex !== currentPage - 1)); setScannedPages(prev => { const n = new Set(prev); n.delete(currentPage); return n; }); setSelectedIds([]); } }}
              title="Delete All"
              icon={<Eraser size={22} />}
              color="text-red-500"
              bg="hover:bg-red-50"
            />
          </motion.aside>
        )}

        <main className="flex-1 overflow-auto bg-slate-200/50 p-12 flex flex-col items-center relative custom-scrollbar">
          <AnimatePresence mode="wait">
            {!file ? (
              <motion.label 
                key="upload"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="m-auto bg-white p-24 rounded-[3.5rem] shadow-2xl border-4 border-dashed border-slate-200 flex flex-col items-center cursor-pointer hover:border-red-400 group transition-all"
              >
                <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mb-8 group-hover:bg-red-50 transition-colors">
                  <Upload className="text-slate-300 group-hover:text-red-400 transition-colors" size={48} />
                </div>
                <input type="file" className="hidden" accept="application/pdf" onChange={onFileChange} />
                <span className="font-black text-slate-400 uppercase tracking-[0.2em] text-sm">DROP PDF HERE</span>
                <span className="text-xs text-slate-300 mt-2 font-bold uppercase tracking-widest">or click to browse</span>
              </motion.label>
            ) : (
              <motion.div 
                key="viewport"
                ref={viewportRef}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="pdf-viewport-container relative shadow-[0_32px_64px_-12px_rgba(0,0,0,0.14)] bg-white origin-top mb-40 select-none touch-none rounded-sm overflow-hidden shrink-0" 
                style={{ 
                  transform: `scale(${scale})`,
                  aspectRatio: pageAspectRatio,
                  height: 'auto',
                  width: 'min(90vw, 1200px)' // Base width used for scaling
                }}
                onPointerDown={(e) => {
                  if ((e.target as HTMLElement).closest('.annotation-node')) return;
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  const x = (e.clientX - rect.left) / rect.width;
                  const y = (e.clientY - rect.top) / rect.height;
                  setSelectionBox({ startX: x, startY: y, endX: x, endY: y });
                  setIsSelecting(true);
                }}
                onPointerMove={(e) => {
                  if (!isSelecting || !selectionBox) return;
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                  const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
                  setSelectionBox(prev => prev ? { ...prev, endX: x, endY: y } : null);
                }}
                onPointerUp={async (e) => {
                  if (!isSelecting || !selectionBox) return;
                  setIsSelecting(false);
                  const width = Math.abs(selectionBox.endX - selectionBox.startX);
                  const height = Math.abs(selectionBox.endY - selectionBox.startY);
                  
                  setSelectionBox(null);
                  if (width < 0.005 && height < 0.005) {
                      if (selectedIds.length > 0) { setSelectedIds([]); return; }
                      const newId = Math.random().toString(36).substring(7);
                      setAnnotations(prev => [...prev, {
                        id: newId, x: selectionBox.startX, y: selectionBox.startY, content: '', fontSize: 18, pageIndex: currentPage - 1,
                        fontFamily: FONTS[0].value, bgColor: COLOR_PRESETS[0].value, bold: false, italic: false, textColor: TEXT_COLORS[0].value,
                      }]);
                      setSelectedIds([newId]);
                      return;
                  }
                  
                  const minX = Math.min(selectionBox.startX, selectionBox.endX);
                  const maxX = Math.max(selectionBox.startX, selectionBox.endX);
                  const minY = Math.min(selectionBox.startY, selectionBox.endY);
                  const maxY = Math.max(selectionBox.startY, selectionBox.endY);
                  
                  if (!pdfDoc) return;
                  setIsProcessing(true);
                  try {
                    const page = await pdfDoc.getPage(currentPage);
                    const textContent = await page.getTextContent();
                    const viewport = page.getViewport({ scale: 1 });
                    
                    const selectedItems = textContent.items.map((item: any) => {
                        const fontSize = Math.sqrt(item.transform[0] ** 2 + item.transform[1] ** 2) || 14;
                        const style = textContent.styles[item.fontName];
                        
                        // Estimate width: very rough but better than a point check
                        // Average char width roughly 0.5 * fontSize
                        const estWidth = (item.str.length * fontSize * 0.5) / viewport.width;
                        const estHeight = fontSize / viewport.height;
                        
                        const itemX = item.transform[4] / viewport.width;
                        const itemY = 1 - ((item.transform[5] + fontSize * 0.8) / viewport.height);

                        return {
                          str: item.str,
                          x: itemX,
                          y: itemY,
                          w: estWidth,
                          h: estHeight,
                          hasEOL: item.hasEOL,
                          fontSize: fontSize,
                          fontFamily: detectFontFamily(style?.fontFamily || '')
                        };
                    }).filter((item: any) => {
                      // Bounding box intersection check
                      const intersects = !(
                        item.x + item.w < minX || 
                        item.x > maxX || 
                        item.y + item.h < minY || 
                        item.y > maxY
                      );
                      return intersects;
                    });
                    
                    selectedItems.sort((a, b) => {
                      if (Math.abs(a.y - b.y) > 0.01) return a.y - b.y;
                      return a.x - b.x;
                    });
                    
                    if (selectedItems.length > 0) {
                      let extractedText = '';
                      let totalFontSize = 0;
                      selectedItems.forEach((item, index) => {
                        extractedText += item.str;
                        totalFontSize += item.fontSize;
                        if (item.hasEOL || (index < selectedItems.length - 1 && Math.abs(selectedItems[index + 1].y - item.y) > 0.01)) {
                            extractedText += '\n';
                        } else {
                            extractedText += ' ';
                        }
                      });
                      
                      const avgFontSize = totalFontSize / selectedItems.length;
                        
                      const fontCounts: Record<string, number> = {};
                      selectedItems.forEach(item => {
                        fontCounts[item.fontFamily] = (fontCounts[item.fontFamily] || 0) + 1;
                      });
                      const dominantFont = Object.keys(fontCounts).reduce((a, b) => fontCounts[a] > fontCounts[b] ? a : b);

                      if (extractedText.trim()) {
                        const newId = Math.random().toString(36).substring(7);
                        setAnnotations(prev => [...prev, {
                          id: newId, x: selectedItems[0].x, y: selectedItems[0].y, content: extractedText.trim(), fontSize: avgFontSize, pageIndex: currentPage - 1,
                            fontFamily: dominantFont, bgColor: COLOR_PRESETS[1].value, bold: false, italic: false, textColor: TEXT_COLORS[0].value,
                        }]);
                        setSelectedIds([newId]);
                      }
                    }
                  } catch (err) {
                    console.error("Text extraction failed", err);
                  } finally {
                    setIsProcessing(false);
                  }
                }}
              >
                <PDFPageRenderer pdfDoc={pdfDoc} pageNumber={currentPage} />
                <div className="absolute inset-0 pointer-events-none z-30">
                  <AnimatePresence>
                    {selectionBox && (
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute bg-blue-500/10 border border-blue-500/50 pointer-events-none rounded-sm" 
                        style={{
                          left: `${Math.min(selectionBox.startX, selectionBox.endX) * 100}%`,
                          top: `${Math.min(selectionBox.startY, selectionBox.endY) * 100}%`,
                          width: `${Math.abs(selectionBox.endX - selectionBox.startX) * 100}%`,
                          height: `${Math.abs(selectionBox.endY - selectionBox.startY) * 100}%`,
                        }} 
                      />
                    )}
                  </AnimatePresence>
                  {annotations.filter(a => a.pageIndex === currentPage - 1).map(ann => (
                    <AnnotationItem key={ann.id} annotation={ann} selected={selectedIds.includes(ann.id)} viewScale={viewScale}
                      onSelect={(multi: boolean) => multi ? setSelectedIds(prev => prev.includes(ann.id) ? prev.filter(i => i !== ann.id) : [...prev, ann.id]) : setSelectedIds([ann.id])}
                      onUpdate={(upd: any) => setAnnotations(prev => prev.map(a => a.id === ann.id ? { ...a, ...upd } : a))}
                      onMove={moveSelected} onDelete={() => { setAnnotations(prev => prev.filter(a => a.id !== ann.id)); setSelectedIds([]); }}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {file && (
          <motion.aside 
            initial={{ x: 320 }}
            animate={{ x: 0 }}
            className="w-80 glass border-l flex flex-col shadow-2xl z-50 overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-5 border-b bg-white/50">
              <div className="flex items-center gap-3 font-black text-[11px] text-slate-900 uppercase tracking-[0.2em]">
                <Settings2 size={18} className="text-red-500" /> PROPERTIES
              </div>
              {selectedIds.length > 0 && (
                <motion.button 
                  whileHover={{ rotate: 90 }}
                  onClick={() => setSelectedIds([])} 
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <X size={18} />
                </motion.button>
              )}
            </div>

            <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
              <AnimatePresence mode="popLayout">
                {selectedIds.length === 0 ? (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4"
                  >
                    <div className="w-16 h-16 bg-slate-50 rounded-3xl flex items-center justify-center text-slate-200">
                      <MousePointer2 size={32} />
                    </div>
                    <div className="text-xs font-bold text-slate-400 leading-relaxed uppercase tracking-widest">Select an item to edit its properties</div>
                  </motion.div>
                ) : (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-8"
                  >
                    <div className="space-y-4">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Typography</label>
                      <div className="flex gap-2">
                        <motion.button whileTap={{ scale: 0.95 }} onClick={() => updateSelected({ bold: !activeAnns[0]?.bold })} className={`flex-1 py-3 border rounded-xl transition-all font-bold text-sm ${activeAnns[0]?.bold ? 'bg-slate-900 text-white shadow-lg' : 'bg-white text-slate-500 border-slate-200'}`}>B</motion.button>
                        <motion.button whileTap={{ scale: 0.95 }} onClick={() => updateSelected({ italic: !activeAnns[0]?.italic })} className={`flex-1 py-3 border rounded-xl transition-all font-serif italic text-sm ${activeAnns[0]?.italic ? 'bg-slate-900 text-white shadow-lg' : 'bg-white text-slate-500 border-slate-200'}`}>I</motion.button>
                      </div>
                      <select value={activeAnns[0]?.fontFamily} onChange={(e) => updateSelected({ fontFamily: e.target.value })} className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50/50 text-xs font-bold outline-none focus:ring-2 focus:ring-red-500 transition-all cursor-pointer">
                        {FONTS.map(f => <option key={f.name} value={f.value}>{f.name}</option>)}
                      </select>
                    </div>

                    <div className="space-y-4">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Scale Settings</label>
                      <div className="flex items-center gap-3">
                        <input
                          type="number"
                          value={Math.round(activeAnns[0]?.fontSize || 14)}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            if (!isNaN(val)) updateSelected({ fontSize: val });
                          }}
                          className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-red-500 transition-all"
                          min="1"
                        />
                        <div className="flex gap-1 shrink-0">
                          <button onClick={() => updateSelected({ fontSize: Math.max(1, (activeAnns[0]?.fontSize || 14) - 2) })} className="p-3 bg-white hover:bg-slate-50 rounded-xl border border-slate-200 text-slate-600 shadow-sm transition-colors"><Minus size={16} /></button>
                          <button onClick={() => updateSelected({ fontSize: (activeAnns[0]?.fontSize || 14) + 2 })} className="p-3 bg-white hover:bg-slate-50 rounded-xl border border-slate-200 text-slate-600 shadow-sm transition-colors"><Plus size={16} /></button>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Colors</label>
                      <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 space-y-6">
                        <div className="space-y-3">
                          <div className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Background</div>
                          <div className="grid grid-cols-4 gap-3">
                            {COLOR_PRESETS.map(c => (
                              <motion.button 
                                key={c.name} 
                                whileHover={{ scale: 1.15 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={() => updateSelected({ bgColor: c.value })} 
                                className={`aspect-square rounded-full border-2 transition-all shadow-sm ${activeAnns[0]?.bgColor?.hex === c.hex ? "border-red-500 ring-4 ring-red-50" : "border-white"}`} 
                                style={{ backgroundColor: c.hex === 'transparent' ? '#cbd5e1' : c.hex }} 
                              />
                            ))}
                          </div>
                        </div>
                        <div className="space-y-3">
                          <div className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Text</div>
                          <div className="grid grid-cols-4 gap-3">
                            {TEXT_COLORS.map(c => (
                              <motion.button
                                key={c.name}
                                whileHover={{ scale: 1.15 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={() => updateSelected({ textColor: c.value })}
                                className={`aspect-square rounded-full border-2 flex items-center justify-center transition-all shadow-sm ${JSON.stringify(activeAnns[0]?.textColor) === JSON.stringify(c.value) ? "border-red-500 ring-4 ring-red-50" : "border-white"}`}
                                style={{ backgroundColor: c.hex }}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {selectedIds.length === 1 && (
                      <div className="space-y-3 animate-fade-in">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Content</label>
                        <textarea 
                          value={activeAnns[0]?.content || ""} 
                          onChange={(e) => updateSelected({ content: e.target.value })} 
                          className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm min-h-[140px] outline-none font-medium focus:ring-2 focus:ring-red-500 transition-all resize-none" 
                        />
                      </div>
                    )}

                    <motion.button 
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => { if(confirm("Remove selected?")) { setAnnotations(prev => prev.filter(a => !selectedIds.includes(a.id))); setSelectedIds([]); } }} 
                      className="w-full py-4 bg-red-50 text-red-600 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-red-500 hover:text-white transition-all shadow-sm shadow-red-100 ring-1 ring-red-100"
                    >
                      Delete Selected ({selectedIds.length})
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.aside>
        )}
      </div>

      <AnimatePresence>
        {file && (
          <motion.div 
            initial={{ y: 100, x: '-50%' }}
            animate={{ y: 0, x: '-50%' }}
            className="fixed bottom-8 left-1/2 glass px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-8 z-50 border-white/50"
          >
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setScale(s => Math.max(0.1, s - 0.1))} 
                className="p-2 hover:bg-white rounded-lg transition-colors text-slate-500 hover:text-red-500"
              >
                <Minus size={20} />
              </button>
              <div className="flex flex-col items-center w-16">
                <span className="text-xs font-black tabular-nums">{Math.round(scale * 100)}%</span>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Zoom</span>
              </div>
              <button 
                onClick={() => setScale(s => Math.min(5, s + 0.1))} 
                className="p-2 hover:bg-white rounded-lg transition-colors text-slate-500 hover:text-red-500"
              >
                <Plus size={20} />
              </button>
            </div>
            <div className="w-px h-8 bg-slate-200" />
            <button 
              onClick={() => setScale(1)}
              className="text-[10px] font-black text-slate-400 hover:text-slate-900 uppercase tracking-widest transition-colors"
            >
              Reset
            </button>
          </motion.div>
        )}
      </AnimatePresence>
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

function AnnotationItem({ annotation, selected, onSelect, onUpdate, onMove, onDelete, viewScale }: any) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [dragStart, setDragStart] = useState<{ x: number, y: number } | null>(null);
  const textColorStyle = `rgb(${annotation.textColor.r * 255}, ${annotation.textColor.g * 255}, ${annotation.textColor.b * 255})`;

  useEffect(() => { if (selected) inputRef.current?.focus(); }, [selected]);

  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.style.width = '10px';
      el.style.height = 'auto';
      // Use viewScale to buffer the width correctly
      const buffer = (annotation.fontSize * viewScale) * 0.4;
      el.style.width = `${el.scrollWidth + buffer}px`;
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [annotation.content, annotation.fontSize, annotation.bold, annotation.fontFamily, viewScale]);

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
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ 
        opacity: 1, 
        scale: 1,
        left: `${annotation.x * 100}%`, 
        top: `${annotation.y * 100}%`,
      }}
      onMouseDown={(e) => { e.stopPropagation(); onSelect(e.ctrlKey || e.metaKey); }}
      className={`absolute pointer-events-auto annotation-node flex items-start group ${selected ? 'z-50' : 'z-10'}`}
      style={{ 
        padding: `${2 * viewScale}px`, 
        margin: `${-2 * viewScale}px`, 
        borderRadius: `${4 * viewScale}px`
      }}
    >
      <AnimatePresence>
        {selected && (
          <motion.div 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            className="absolute -left-12 top-0 flex flex-col gap-1"
          >
            <div 
              onMouseDown={(e) => { e.stopPropagation(); setDragStart({ x: e.clientX, y: e.clientY }); }} 
              className="p-2 bg-slate-900 text-white rounded-lg cursor-move shadow-xl hover:bg-black transition-colors"
              title="Move"
            >
              <Move size={14} />
            </div>
            <button 
              onClick={(e) => { e.stopPropagation(); if(confirm("Delete this?")) onDelete(); }}
              className="p-2 bg-red-500 text-white rounded-lg shadow-xl hover:bg-red-600 transition-colors"
              title="Delete"
            >
              <Trash2 size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div 
        className={`transition-all duration-200 flex items-center rounded ${selected ? "ring-2 ring-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)] bg-white/10" : "group-hover:ring-1 group-hover:ring-slate-300"}`} 
        style={{ backgroundColor: bgColorStyle }}
      >
        <textarea
          ref={inputRef}
          value={annotation.content}
          rows={1}
          spellCheck={false}
          onChange={(e) => onUpdate({ content: e.target.value })}
          onBlur={() => annotation.content.trim() === "" && !selected && onDelete()}
          className="bg-transparent outline-none border-none p-0 m-0 resize-none overflow-hidden block placeholder-slate-300 transition-colors"
          placeholder={selected ? "Type here..." : ""}
          style={{
            display: 'block',
            whiteSpace: 'pre',
            fontSize: `${annotation.fontSize * viewScale}px`,
            fontFamily: annotation.fontFamily === 'sarabun' ? '"TH Sarabun New", "Sarabun", sans-serif' :
              annotation.fontFamily === 'monospace' ? 'ui-monospace, monospace' : 'ui-sans-serif, sans-serif',
            fontWeight: annotation.bold ? 'bold' : 'normal',
            fontStyle: annotation.italic ? 'italic' : 'normal',
            color: textColorStyle,
            lineHeight: '1.2',
            minWidth: '1ch',
            padding: '0',
            margin: '0',
          } as React.CSSProperties}
        />
      </div>
    </motion.div>
  );
}