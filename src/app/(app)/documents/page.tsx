'use client'

import { useState, useEffect, useRef } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { createClient } from '@/lib/supabase/client'
import {
  FileText, FolderOpen, Upload, Search, Download, Trash2,
  Loader2, Plus, File, FileImage, FileSpreadsheet, Film, Archive,
  ChevronRight,
} from 'lucide-react'

const FOLDERS = [
  'General',
  'SOPs & Procedures',
  'Contracts',
  'HR & Payroll',
  'Finance',
  'Fleet & Vehicles',
  'Safety',
  'Marketing',
]

interface Doc {
  id: string
  title: string
  folder: string
  file_url: string | null
  file_name: string | null
  file_size: number | null
  mime_type: string | null
  uploaded_by: string | null
  notes: string | null
  created_at: string
  uploader?: { name: string } | null
}

function fileIcon(mime: string | null) {
  if (!mime) return <File className="w-5 h-5 text-slate-400" />
  if (mime.startsWith('image/')) return <FileImage className="w-5 h-5 text-blue-400" />
  if (mime.includes('pdf')) return <FileText className="w-5 h-5 text-red-400" />
  if (mime.includes('sheet') || mime.includes('excel') || mime.includes('csv')) return <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
  if (mime.includes('video')) return <Film className="w-5 h-5 text-purple-400" />
  if (mime.includes('zip') || mime.includes('rar')) return <Archive className="w-5 h-5 text-amber-400" />
  return <File className="w-5 h-5 text-slate-400" />
}

function formatSize(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function DocumentsPage() {
  const [docs, setDocs] = useState<Doc[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [folder, setFolder] = useState('All')
  const [uploading, setUploading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [myStaff, setMyStaff] = useState<{ id: string; name: string } | null>(null)
  const [form, setForm] = useState({ title: '', folder: 'General', notes: '' })
  const [file, setFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const init = async () => {
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      if (user) {
        const { data } = await sb.from('staff').select('id, name').eq('auth_user_id', user.id).single()
        if (data) setMyStaff(data as any)
      }
      await load()
    }
    init()
  }, [])

  const load = async () => {
    setLoading(true)
    const sb = createClient()
    const { data } = await sb
      .from('documents')
      .select('*, uploader:staff!uploaded_by(name)')
      .order('created_at', { ascending: false })
    setDocs((data ?? []) as Doc[])
    setLoading(false)
  }

  const handleUpload = async () => {
    if (!form.title) return
    setUploading(true)
    const sb = createClient()
    let fileUrl: string | null = null
    let fileName: string | null = null
    let fileSize: number | null = null
    let mimeType: string | null = null

    if (file) {
      const path = `documents/${Date.now()}-${file.name}`
      const { data: uploadData, error: uploadError } = await sb.storage.from('kembali-docs').upload(path, file, {
        contentType: file.type,
      })
      if (!uploadError && uploadData) {
        const { data: urlData } = sb.storage.from('kembali-docs').getPublicUrl(path)
        fileUrl = urlData.publicUrl
        fileName = file.name
        fileSize = file.size
        mimeType = file.type
      } else if (uploadError) {
        // Bucket may not exist yet — save metadata only, mark filename for reference
        fileName = file.name
        fileSize = file.size
        mimeType = file.type
        // fileUrl remains null; user sees the filename but no download link
      }
    }

    await sb.from('documents').insert({
      title: form.title,
      folder: form.folder,
      notes: form.notes || null,
      file_url: fileUrl,
      file_name: fileName,
      file_size: fileSize,
      mime_type: mimeType,
      uploaded_by: myStaff?.id ?? null,
    })

    setShowForm(false)
    setForm({ title: '', folder: 'General', notes: '' })
    setFile(null)
    setUploading(false)
    await load()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this document?')) return
    const sb = createClient()
    await sb.from('documents').delete().eq('id', id)
    setDocs(prev => prev.filter(d => d.id !== id))
  }

  const filtered = docs.filter(d => {
    const matchFolder = folder === 'All' || d.folder === folder
    const matchSearch = !search || d.title.toLowerCase().includes(search.toLowerCase()) ||
      (d.file_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (d.notes ?? '').toLowerCase().includes(search.toLowerCase())
    return matchFolder && matchSearch
  })

  const countByFolder = FOLDERS.reduce((acc, f) => {
    acc[f] = docs.filter(d => d.folder === f).length
    return acc
  }, {} as Record<string, number>)

  return (
    <>
      <Topbar title="Document Library" />
      <div className="flex h-[calc(100vh-64px)] overflow-hidden">

        {/* Sidebar */}
        <div className="w-56 bg-slate-50 border-r flex flex-col flex-shrink-0 overflow-y-auto">
          <div className="p-3">
            <button
              onClick={() => { setShowForm(true) }}
              className="w-full flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white py-2 rounded-xl text-sm font-medium transition-colors mb-4"
            >
              <Plus className="w-4 h-4" /> Upload Document
            </button>

            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 px-1">Folders</p>
            <button
              onClick={() => setFolder('All')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${folder === 'All' ? 'bg-cyan-600 text-white' : 'text-slate-600 hover:bg-slate-200'}`}
            >
              <span className="flex items-center gap-2"><FolderOpen className="w-4 h-4" /> All Files</span>
              <span className="text-xs opacity-70">{docs.length}</span>
            </button>
            {FOLDERS.map(f => (
              <button
                key={f}
                onClick={() => setFolder(f)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${folder === f ? 'bg-cyan-600 text-white' : 'text-slate-600 hover:bg-slate-200'}`}
              >
                <span className="flex items-center gap-2 truncate">
                  <FolderOpen className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">{f}</span>
                </span>
                {countByFolder[f] > 0 && <span className="text-xs opacity-70 flex-shrink-0">{countByFolder[f]}</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Main */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* Upload form */}
          {showForm && (
            <div className="border-b bg-slate-50 p-4">
              <div className="max-w-xl space-y-3">
                <h3 className="font-semibold text-slate-800 text-sm">Upload Document</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Title *</label>
                    <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                      placeholder="Document name"
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Folder</label>
                    <select value={form.folder} onChange={e => setForm({ ...form, folder: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm">
                      {FOLDERS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">File (optional)</label>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center cursor-pointer hover:border-cyan-400 hover:bg-cyan-50 transition-colors"
                  >
                    {file ? (
                      <p className="text-sm font-medium text-cyan-700">{file.name} ({formatSize(file.size)})</p>
                    ) : (
                      <p className="text-sm text-slate-400"><Upload className="w-4 h-4 inline mr-1.5" />Click to browse or drag file here</p>
                    )}
                  </div>
                  <input ref={fileInputRef} type="file" className="hidden"
                    onChange={e => setFile(e.target.files?.[0] ?? null)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Notes</label>
                  <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                    placeholder="Optional description"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-400" />
                </div>
                <div className="flex gap-2">
                  <button onClick={handleUpload} disabled={uploading || !form.title}
                    className="inline-flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {uploading ? 'Uploading…' : 'Save Document'}
                  </button>
                  <button onClick={() => { setShowForm(false); setFile(null) }}
                    className="px-4 py-2 rounded-lg border text-sm font-medium hover:bg-slate-100 transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Search */}
          <div className="p-4 border-b">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search documents…"
                className="w-full pl-9 pr-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-cyan-400"
              />
            </div>
          </div>

          {/* File list */}
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="flex justify-center pt-10"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16">
                <FolderOpen className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="font-medium text-slate-400">No documents found</p>
                <p className="text-sm text-slate-300 mt-1">Upload your first document to get started</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filtered.map(doc => (
                  <div key={doc.id} className="bg-white border rounded-xl p-4 hover:shadow-sm transition-shadow group">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">{fileIcon(doc.mime_type)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800 text-sm truncate">{doc.title}</p>
                        {doc.file_name && (
                          <p className="text-xs text-slate-400 truncate">{doc.file_name} {doc.file_size ? `· ${formatSize(doc.file_size)}` : ''}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-slate-400 bg-slate-100 rounded px-1.5 py-0.5">{doc.folder}</span>
                          <span className="text-xs text-slate-300">
                            {new Date(doc.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        </div>
                        {doc.notes && <p className="text-xs text-slate-500 mt-1.5 line-clamp-2">{doc.notes}</p>}
                        {doc.uploader && <p className="text-xs text-slate-400 mt-1">↑ {(doc.uploader as any).name}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100 opacity-0 group-hover:opacity-100 transition-opacity">
                      {doc.file_url && (
                        <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs text-cyan-600 hover:text-cyan-800 font-medium">
                          <Download className="w-3.5 h-3.5" /> Download
                        </a>
                      )}
                      <button onClick={() => handleDelete(doc.id)}
                        className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-600 font-medium ml-auto">
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
