'use client';
import {useRef} from 'react';
import {Plus, X} from 'lucide-react';
import {isReferenceRole, maxReferences, referenceRoles, validImage, type ReferencePhoto} from '../lib/studio/references';
import {BlobImage} from './blob-image';

type Props = {
  photos: ReferencePhoto[];
  disabled: boolean;
  onChange: (photos: ReferencePhoto[]) => void;
  onWarning: (message: string) => void;
};

export function ReferencePhotos({photos, disabled, onChange, onWarning}: Props) {
  const input = useRef<HTMLInputElement>(null);
  function add(files: File[]) {
    if (disabled || files.length === 0) return;
    if (photos.length + files.length > maxReferences) {
      onWarning('Adicione até três fotos de referência.');
      return;
    }
    if (!files.every(validImage)) {
      onWarning('Escolha referências em PNG, JPEG ou WebP de até 20 MB.');
      return;
    }
    onChange([...photos, ...files.map(file => ({id: crypto.randomUUID(), file, role: 'face' as const}))]);
    onWarning('');
  }

  return <fieldset className="reference-photos" disabled={disabled}
    onDragOver={e => {e.preventDefault(); e.stopPropagation()}}
    onDrop={e => {e.preventDefault(); e.stopPropagation(); add(Array.from(e.dataTransfer.files))}}>
    <legend>Fotos de referência</legend>
    <p>Escolha o que usar de cada foto. Envie até três referências, com 20 MB no total por edição.</p>
    <input type="file" ref={input} aria-label="Arquivos de referência" multiple hidden
      accept="image/png,image/jpeg,image/webp" onChange={e => {
        add(Array.from(e.target.files ?? [])); e.target.value = '';
      }}/>
    {photos.map(photo => <div className="reference-row" key={photo.id}>
      <BlobImage blob={photo.file} alt=""/>
      <span title={photo.file.name}>{photo.file.name}</span>
      <select value={photo.role} aria-label={'Função de ' + photo.file.name} onChange={e => {
        const role = e.target.value;
        if (isReferenceRole(role)) onChange(photos.map(p => p.id === photo.id ? {...p, role} : p));
      }}>
        {Object.entries(referenceRoles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <button type="button" aria-label={'Remover ' + photo.file.name}
        onClick={() => {onChange(photos.filter(p => p.id !== photo.id)); onWarning('')}}><X size={16}/></button>
    </div>)}
    {photos.length < maxReferences && <button type="button" className="secondary" onClick={() => input.current?.click()}>
      <Plus size={15}/>Adicionar referência
    </button>}
  </fieldset>;
}
