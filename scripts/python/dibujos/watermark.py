#!/usr/bin/env python3
"""
Script para agregar marca de agua a imagenes recursivamente.
Procesa todas las imagenes en input/ y las exporta a output/ con la misma estructura.
"""

import os
import sys
from pathlib import Path
from PIL import Image

# Directorios (relativos al script)
HERE = Path(__file__).resolve().parent
INPUT_DIR = str(HERE / "input")
OUTPUT_DIR = str(HERE / "output")
WATERMARK_PATH = str(HERE / "firma.png")

# Extensiones de imagen soportadas
SUPPORTED_FORMATS = {'.jpg', '.jpeg', '.png', '.bmp', '.gif', '.tiff', '.webp'}


def crear_directorio_salida(ruta_salida):
    """Crea el directorio de salida si no existe."""
    Path(ruta_salida).mkdir(parents=True, exist_ok=True)


def cargar_marca_agua(ruta_marca):
    """Carga la imagen de marca de agua."""
    if not os.path.exists(ruta_marca):
        print(f"[ERROR] Archivo de marca de agua no encontrado: {ruta_marca}")
        return None
    
    try:
        marca = Image.open(ruta_marca).convert('RGBA')
        print(f"[OK] Marca de agua cargada: {ruta_marca}")
        return marca
    except Exception as e:
        print(f"[ERROR] No se pudo cargar la marca de agua: {e}")
        return None


def redimensionar_marca_agua(marca_original, ancho_destino_15pct):
    """
    Redimensiona la marca de agua al 15% del ancho de la imagen destino.
    Mantiene la proporcion original.
    """
    ancho_original, alto_original = marca_original.size
    proporcion = alto_original / ancho_original
    
    nuevo_ancho = ancho_destino_15pct
    nuevo_alto = int(nuevo_ancho * proporcion)
    
    marca_redimensionada = marca_original.resize((nuevo_ancho, nuevo_alto), Image.Resampling.LANCZOS)
    return marca_redimensionada


def agregar_marca_agua(imagen_path, marca_original, ruta_salida):
    """Agrega marca de agua a una imagen y la guarda."""
    try:
        # Abrir imagen
        imagen = Image.open(imagen_path).convert('RGB')
        ancho_img, alto_img = imagen.size
        
        # Escalar imagen x2 para mejor legibilidad de la firma
        ancho_escalado = int(ancho_img * 1.5)
        alto_escalado = int(alto_img * 1.5)
        imagen = imagen.resize((ancho_escalado, alto_escalado), Image.Resampling.LANCZOS)
        ancho_img, alto_img = imagen.size
        
        # Redimensionar marca al 15% del ancho
        ancho_15pct = int(ancho_img * 0.15)
        marca = redimensionar_marca_agua(marca_original, ancho_15pct)
        
        # Calcular posicion (esquina inferior derecha)
        x = ancho_img - marca.width - 10  # 10px de margen
        y = alto_img - marca.height - 10  # 10px de margen
        
        # Crear copia de la imagen para no modificar la original
        imagen_con_marca = imagen.copy()
        imagen_con_marca.paste(marca, (x, y), marca)
        
        # Guardar imagen
        imagen_con_marca.save(ruta_salida, quality=95)
        print(f"[OK] Procesada: {imagen_path}")
        return True
        
    except Exception as e:
        print(f"[ERROR] Error procesando {imagen_path}: {e}")
        return False


def procesar_imagenes():
    """Procesa todas las imagenes recursivamente."""
    
    # Validar directorios
    if not os.path.exists(INPUT_DIR):
        print(f"[ERROR] Directorio de entrada no existe: {INPUT_DIR}")
        return False
    
    if not os.path.exists(WATERMARK_PATH):
        print(f"[ERROR] Archivo de marca de agua no existe: {WATERMARK_PATH}")
        return False
    
    # Crear directorio de salida
    crear_directorio_salida(OUTPUT_DIR)
    
    # Cargar marca de agua
    marca_original = cargar_marca_agua(WATERMARK_PATH)
    if not marca_original:
        return False
    
    # Procesar imagenes
    total = 0
    procesadas = 0
    
    print(f"\n[INICIO] Procesando imagenes desde: {INPUT_DIR}")
    print(f"[SALIDA] Guardando en: {OUTPUT_DIR}\n")
    
    for root, dirs, files in os.walk(INPUT_DIR):
        for archivo in files:
            # Verificar si es una imagen
            if Path(archivo).suffix.lower() not in SUPPORTED_FORMATS:
                continue
            
            total += 1
            ruta_entrada = os.path.join(root, archivo)
            
            # Calcular ruta de salida manteniendo estructura
            ruta_relativa = os.path.relpath(ruta_entrada, INPUT_DIR)
            ruta_salida = os.path.join(OUTPUT_DIR, ruta_relativa)
            
            # Crear directorio de salida si no existe
            os.makedirs(os.path.dirname(ruta_salida), exist_ok=True)
            
            # Procesar imagen
            if agregar_marca_agua(ruta_entrada, marca_original, ruta_salida):
                procesadas += 1
    
    # Resumen
    print(f"\n[RESUMEN]")
    print(f"Total de imagenes encontradas: {total}")
    print(f"Imagenes procesadas exitosamente: {procesadas}")
    print(f"Imagenes con error: {total - procesadas}")
    
    if procesadas == total and total > 0:
        print(f"\n[EXITO] Todas las imagenes fueron procesadas correctamente")
        return True
    else:
        print(f"\n[ADVERTENCIA] Algunas imagenes no se procesaron correctamente")
        return procesadas > 0


if __name__ == "__main__":
    try:
        exito = procesar_imagenes()
        sys.exit(0 if exito else 1)
    except KeyboardInterrupt:
        print("\n[CANCELADO] Proceso interrumpido por el usuario")
        sys.exit(1)
    except Exception as e:
        print(f"\n[ERROR FATAL] {e}")
        sys.exit(1)