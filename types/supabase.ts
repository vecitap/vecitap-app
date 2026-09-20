export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ajustes: {
        Row: {
          creado_en: string
          creado_por: string | null
          destino: string
          fecha: string
          id: string
          monto: number
          motivo: string
          org_id: string
          periodo_cierre_id: string | null
          unidad_id: string
        }
        Insert: {
          creado_en?: string
          creado_por?: string | null
          destino?: string
          fecha?: string
          id?: string
          monto: number
          motivo: string
          org_id: string
          periodo_cierre_id?: string | null
          unidad_id: string
        }
        Update: {
          creado_en?: string
          creado_por?: string | null
          destino?: string
          fecha?: string
          id?: string
          monto?: number
          motivo?: string
          org_id?: string
          periodo_cierre_id?: string | null
          unidad_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ajustes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ajustes_periodo_cierre_id_fkey"
            columns: ["periodo_cierre_id"]
            isOneToOne: false
            referencedRelation: "periodos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ajustes_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "saldos_actuales"
            referencedColumns: ["unidad_id"]
          },
          {
            foreignKeyName: "ajustes_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      ajustes_correo: {
        Row: {
          activo: boolean
          actualizado: string
          enlace_base: string | null
          nota: string | null
          nota_hasta: string | null
          org_id: string
          remitente: string | null
          responder_a: string | null
        }
        Insert: {
          activo?: boolean
          actualizado?: string
          enlace_base?: string | null
          nota?: string | null
          nota_hasta?: string | null
          org_id: string
          remitente?: string | null
          responder_a?: string | null
        }
        Update: {
          activo?: boolean
          actualizado?: string
          enlace_base?: string | null
          nota?: string | null
          nota_hasta?: string | null
          org_id?: string
          remitente?: string | null
          responder_a?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ajustes_correo_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      auditoria: {
        Row: {
          accion: string
          antes: Json | null
          creado_en: string
          despues: Json | null
          entidad: string
          entidad_id: string | null
          id: number
          org_id: string | null
          usuario_id: string | null
        }
        Insert: {
          accion: string
          antes?: Json | null
          creado_en?: string
          despues?: Json | null
          entidad: string
          entidad_id?: string | null
          id?: number
          org_id?: string | null
          usuario_id?: string | null
        }
        Update: {
          accion?: string
          antes?: Json | null
          creado_en?: string
          despues?: Json | null
          entidad?: string
          entidad_id?: string | null
          id?: number
          org_id?: string | null
          usuario_id?: string | null
        }
        Relationships: []
      }
      bancos: {
        Row: {
          activo: boolean
          codigo: string
          corto: string | null
          nombre: string
          orden: number
        }
        Insert: {
          activo?: boolean
          codigo: string
          corto?: string | null
          nombre: string
          orden?: number
        }
        Update: {
          activo?: boolean
          codigo?: string
          corto?: string | null
          nombre?: string
          orden?: number
        }
        Relationships: []
      }
      categorias: {
        Row: {
          edificio_id: string
          id: string
          nombre: string
          orden: number
          org_id: string
        }
        Insert: {
          edificio_id: string
          id?: string
          nombre: string
          orden?: number
          org_id: string
        }
        Update: {
          edificio_id?: string
          id?: string
          nombre?: string
          orden?: number
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categorias_edificio_id_fkey"
            columns: ["edificio_id"]
            isOneToOne: false
            referencedRelation: "edificios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categorias_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      cobros_suscripcion: {
        Row: {
          creado_en: string
          desde: string
          estado: string
          fecha_pago: string | null
          hasta: string
          id: string
          metodo: string | null
          monto: number
          nota: string | null
          org_id: string
          referencia: string | null
          unidades: number | null
        }
        Insert: {
          creado_en?: string
          desde: string
          estado?: string
          fecha_pago?: string | null
          hasta: string
          id?: string
          metodo?: string | null
          monto: number
          nota?: string | null
          org_id: string
          referencia?: string | null
          unidades?: number | null
        }
        Update: {
          creado_en?: string
          desde?: string
          estado?: string
          fecha_pago?: string | null
          hasta?: string
          id?: string
          metodo?: string | null
          monto?: number
          nota?: string | null
          org_id?: string
          referencia?: string | null
          unidades?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cobros_suscripcion_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      cola_correo: {
        Row: {
          asunto: string
          destino: string
          encolado_en: string
          enviado_en: string | null
          estado: string
          html: string
          id: string
          intentos: number
          org_id: string
          proveedor_id: string | null
          recibo_id: string | null
          request_id: number | null
          responder_a: string | null
          texto: string | null
          tipo: string
          ultimo_error: string | null
          unidad_id: string | null
        }
        Insert: {
          asunto: string
          destino: string
          encolado_en?: string
          enviado_en?: string | null
          estado?: string
          html: string
          id?: string
          intentos?: number
          org_id: string
          proveedor_id?: string | null
          recibo_id?: string | null
          request_id?: number | null
          responder_a?: string | null
          texto?: string | null
          tipo?: string
          ultimo_error?: string | null
          unidad_id?: string | null
        }
        Update: {
          asunto?: string
          destino?: string
          encolado_en?: string
          enviado_en?: string | null
          estado?: string
          html?: string
          id?: string
          intentos?: number
          org_id?: string
          proveedor_id?: string | null
          recibo_id?: string | null
          request_id?: number | null
          responder_a?: string | null
          texto?: string | null
          tipo?: string
          ultimo_error?: string | null
          unidad_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cola_correo_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cola_correo_recibo_id_fkey"
            columns: ["recibo_id"]
            isOneToOne: false
            referencedRelation: "recibos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cola_correo_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "saldos_actuales"
            referencedColumns: ["unidad_id"]
          },
          {
            foreignKeyName: "cola_correo_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      comprobantes: {
        Row: {
          bytes: number
          id: string
          imagen_borrada_en: string | null
          org_id: string
          pago_id: string
          ruta: string
          sha256: string | null
          subido_en: string
          subido_por: string | null
          tipo: string
          unidad_id: string
        }
        Insert: {
          bytes: number
          id?: string
          imagen_borrada_en?: string | null
          org_id: string
          pago_id: string
          ruta: string
          sha256?: string | null
          subido_en?: string
          subido_por?: string | null
          tipo: string
          unidad_id: string
        }
        Update: {
          bytes?: number
          id?: string
          imagen_borrada_en?: string | null
          org_id?: string
          pago_id?: string
          ruta?: string
          sha256?: string | null
          subido_en?: string
          subido_por?: string | null
          tipo?: string
          unidad_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comprobantes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobantes_pago_id_fkey"
            columns: ["pago_id"]
            isOneToOne: false
            referencedRelation: "pagos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobantes_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "saldos_actuales"
            referencedColumns: ["unidad_id"]
          },
          {
            foreignKeyName: "comprobantes_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      conceptos_cobro: {
        Row: {
          activo: boolean
          bolsillo: string
          creado_en: string
          edificio_id: string | null
          id: string
          iva: number
          modo: string
          monto: number
          nombre: string
          orden: number
          org_id: string
        }
        Insert: {
          activo?: boolean
          bolsillo: string
          creado_en?: string
          edificio_id?: string | null
          id?: string
          iva?: number
          modo: string
          monto?: number
          nombre: string
          orden?: number
          org_id: string
        }
        Update: {
          activo?: boolean
          bolsillo?: string
          creado_en?: string
          edificio_id?: string | null
          id?: string
          iva?: number
          modo?: string
          monto?: number
          nombre?: string
          orden?: number
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conceptos_cobro_edificio_id_fkey"
            columns: ["edificio_id"]
            isOneToOne: false
            referencedRelation: "edificios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conceptos_cobro_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      correos_malos: {
        Row: {
          anotado_en: string
          correo: string
          motivo: string | null
        }
        Insert: {
          anotado_en?: string
          correo: string
          motivo?: string | null
        }
        Update: {
          anotado_en?: string
          correo?: string
          motivo?: string | null
        }
        Relationships: []
      }
      cortes_mensuales: {
        Row: {
          ajustado: number
          cerrado_en: string
          cobrado: number
          edificio_id: string
          emitido: number
          id: string
          mora_acumulada: number
          org_id: string
          periodo_id: string
          saldo_condominio: number
          saldo_honorarios: number
          saldo_servicio: number
          tasa_bcv: number
          unidad_id: string
        }
        Insert: {
          ajustado?: number
          cerrado_en?: string
          cobrado?: number
          edificio_id: string
          emitido?: number
          id?: string
          mora_acumulada?: number
          org_id: string
          periodo_id: string
          saldo_condominio: number
          saldo_honorarios: number
          saldo_servicio?: number
          tasa_bcv: number
          unidad_id: string
        }
        Update: {
          ajustado?: number
          cerrado_en?: string
          cobrado?: number
          edificio_id?: string
          emitido?: number
          id?: string
          mora_acumulada?: number
          org_id?: string
          periodo_id?: string
          saldo_condominio?: number
          saldo_honorarios?: number
          saldo_servicio?: number
          tasa_bcv?: number
          unidad_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cortes_mensuales_edificio_id_fkey"
            columns: ["edificio_id"]
            isOneToOne: false
            referencedRelation: "edificios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cortes_mensuales_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cortes_mensuales_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "periodos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cortes_mensuales_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "saldos_actuales"
            referencedColumns: ["unidad_id"]
          },
          {
            foreignKeyName: "cortes_mensuales_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      edificios: {
        Row: {
          activo: boolean
          creado_en: string
          dia_vencimiento: number
          direccion: string | null
          honorario_iva: number
          honorario_modo: string
          honorario_monto: number
          id: string
          interes_mora: number
          mora_activa: boolean
          nombre: string
          org_id: string
          prefijo_recibo: string
          rif: string | null
          tolerancia_alicuota: number
          tolerancia_redondeo: number
        }
        Insert: {
          activo?: boolean
          creado_en?: string
          dia_vencimiento?: number
          direccion?: string | null
          honorario_iva?: number
          honorario_modo?: string
          honorario_monto?: number
          id?: string
          interes_mora?: number
          mora_activa?: boolean
          nombre: string
          org_id: string
          prefijo_recibo?: string
          rif?: string | null
          tolerancia_alicuota?: number
          tolerancia_redondeo?: number
        }
        Update: {
          activo?: boolean
          creado_en?: string
          dia_vencimiento?: number
          direccion?: string | null
          honorario_iva?: number
          honorario_modo?: string
          honorario_monto?: number
          id?: string
          interes_mora?: number
          mora_activa?: boolean
          nombre?: string
          org_id?: string
          prefijo_recibo?: string
          rif?: string | null
          tolerancia_alicuota?: number
          tolerancia_redondeo?: number
        }
        Relationships: [
          {
            foreignKeyName: "edificios_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      gastos: {
        Row: {
          bolsillo: string
          categoria_id: string | null
          concepto: string
          creado_en: string
          id: string
          monto: number
          orden: number
          org_id: string
          periodo_id: string
          referencia: string | null
          tipo: string
          unidad_id: string | null
        }
        Insert: {
          bolsillo?: string
          categoria_id?: string | null
          concepto?: string
          creado_en?: string
          id?: string
          monto?: number
          orden?: number
          org_id: string
          periodo_id: string
          referencia?: string | null
          tipo?: string
          unidad_id?: string | null
        }
        Update: {
          bolsillo?: string
          categoria_id?: string | null
          concepto?: string
          creado_en?: string
          id?: string
          monto?: number
          orden?: number
          org_id?: string
          periodo_id?: string
          referencia?: string | null
          tipo?: string
          unidad_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gastos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gastos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gastos_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "periodos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gastos_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "saldos_actuales"
            referencedColumns: ["unidad_id"]
          },
          {
            foreignKeyName: "gastos_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      invitaciones: {
        Row: {
          correo: string
          creada_en: string
          creada_por: string | null
          edificio_id: string | null
          expira_en: string
          id: string
          org_id: string
          relacion: string | null
          rol: string
          token_hash: string
          unidad_id: string | null
          usada_en: string | null
        }
        Insert: {
          correo: string
          creada_en?: string
          creada_por?: string | null
          edificio_id?: string | null
          expira_en?: string
          id?: string
          org_id: string
          relacion?: string | null
          rol: string
          token_hash: string
          unidad_id?: string | null
          usada_en?: string | null
        }
        Update: {
          correo?: string
          creada_en?: string
          creada_por?: string | null
          edificio_id?: string | null
          expira_en?: string
          id?: string
          org_id?: string
          relacion?: string | null
          rol?: string
          token_hash?: string
          unidad_id?: string | null
          usada_en?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invitaciones_edificio_id_fkey"
            columns: ["edificio_id"]
            isOneToOne: false
            referencedRelation: "edificios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitaciones_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitaciones_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "saldos_actuales"
            referencedColumns: ["unidad_id"]
          },
          {
            foreignKeyName: "invitaciones_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      membresias: {
        Row: {
          activo: boolean
          creada_en: string
          edificio_id: string | null
          id: string
          org_id: string
          relacion: string | null
          rol: string
          unidad_id: string | null
          usuario_id: string
        }
        Insert: {
          activo?: boolean
          creada_en?: string
          edificio_id?: string | null
          id?: string
          org_id: string
          relacion?: string | null
          rol?: string
          unidad_id?: string | null
          usuario_id: string
        }
        Update: {
          activo?: boolean
          creada_en?: string
          edificio_id?: string | null
          id?: string
          org_id?: string
          relacion?: string | null
          rol?: string
          unidad_id?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "membresias_edificio_id_fkey"
            columns: ["edificio_id"]
            isOneToOne: false
            referencedRelation: "edificios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membresias_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membresias_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "saldos_actuales"
            referencedColumns: ["unidad_id"]
          },
          {
            foreignKeyName: "membresias_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      modulos: {
        Row: {
          clave: string
          descripcion: string | null
          nombre: string
          nucleo: boolean
          orden: number
          por_defecto: boolean
        }
        Insert: {
          clave: string
          descripcion?: string | null
          nombre: string
          nucleo?: boolean
          orden?: number
          por_defecto?: boolean
        }
        Update: {
          clave?: string
          descripcion?: string | null
          nombre?: string
          nucleo?: boolean
          orden?: number
          por_defecto?: boolean
        }
        Relationships: []
      }
      modulos_org: {
        Row: {
          activo: boolean
          actualizado_en: string
          actualizado_por: string | null
          clave: string
          edificio_id: string | null
          id: string
          nota: string | null
          org_id: string
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          actualizado_por?: string | null
          clave: string
          edificio_id?: string | null
          id?: string
          nota?: string | null
          org_id: string
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          actualizado_por?: string | null
          clave?: string
          edificio_id?: string | null
          id?: string
          nota?: string | null
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "modulos_org_clave_fkey"
            columns: ["clave"]
            isOneToOne: false
            referencedRelation: "modulos"
            referencedColumns: ["clave"]
          },
          {
            foreignKeyName: "modulos_org_edificio_id_fkey"
            columns: ["edificio_id"]
            isOneToOne: false
            referencedRelation: "edificios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modulos_org_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      movimientos_banco: {
        Row: {
          creado_en: string
          descripcion: string | null
          edificio_id: string
          fecha: string | null
          huella: string
          id: string
          monto: number | null
          org_id: string
          pago_id: string | null
          referencia: string | null
        }
        Insert: {
          creado_en?: string
          descripcion?: string | null
          edificio_id: string
          fecha?: string | null
          huella: string
          id?: string
          monto?: number | null
          org_id: string
          pago_id?: string | null
          referencia?: string | null
        }
        Update: {
          creado_en?: string
          descripcion?: string | null
          edificio_id?: string
          fecha?: string | null
          huella?: string
          id?: string
          monto?: number | null
          org_id?: string
          pago_id?: string | null
          referencia?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_banco_edificio_id_fkey"
            columns: ["edificio_id"]
            isOneToOne: false
            referencedRelation: "edificios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_banco_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_banco_pago_id_fkey"
            columns: ["pago_id"]
            isOneToOne: false
            referencedRelation: "pagos"
            referencedColumns: ["id"]
          },
        ]
      }
      operadores: {
        Row: {
          activo: boolean
          creado_en: string
          nombre: string | null
          usuario_id: string
        }
        Insert: {
          activo?: boolean
          creado_en?: string
          nombre?: string | null
          usuario_id: string
        }
        Update: {
          activo?: boolean
          creado_en?: string
          nombre?: string | null
          usuario_id?: string
        }
        Relationships: []
      }
      organizaciones: {
        Row: {
          acento: string | null
          creada_en: string
          id: string
          logo_url: string | null
          nombre: string
          plan: string
          rif: string | null
        }
        Insert: {
          acento?: string | null
          creada_en?: string
          id?: string
          logo_url?: string | null
          nombre: string
          plan?: string
          rif?: string | null
        }
        Update: {
          acento?: string | null
          creada_en?: string
          id?: string
          logo_url?: string | null
          nombre?: string
          plan?: string
          rif?: string | null
        }
        Relationships: []
      }
      pagos: {
        Row: {
          banco: string | null
          banco_codigo: string | null
          conciliado_en: string | null
          conciliado_por: string | null
          correo_origen: string | null
          creado_en: string
          destino: string
          documento_origen: string | null
          estado: string
          fecha: string
          id: string
          metodo: string | null
          moneda: string
          monto: number
          monto_usd: number
          nota: string | null
          org_id: string
          periodo_cierre_id: string | null
          referencia: string | null
          reportado_por: string | null
          tasa_aplicada: number | null
          telefono_origen: string | null
          unidad_id: string
        }
        Insert: {
          banco?: string | null
          banco_codigo?: string | null
          conciliado_en?: string | null
          conciliado_por?: string | null
          correo_origen?: string | null
          creado_en?: string
          destino?: string
          documento_origen?: string | null
          estado?: string
          fecha?: string
          id?: string
          metodo?: string | null
          moneda?: string
          monto: number
          monto_usd: number
          nota?: string | null
          org_id: string
          periodo_cierre_id?: string | null
          referencia?: string | null
          reportado_por?: string | null
          tasa_aplicada?: number | null
          telefono_origen?: string | null
          unidad_id: string
        }
        Update: {
          banco?: string | null
          banco_codigo?: string | null
          conciliado_en?: string | null
          conciliado_por?: string | null
          correo_origen?: string | null
          creado_en?: string
          destino?: string
          documento_origen?: string | null
          estado?: string
          fecha?: string
          id?: string
          metodo?: string | null
          moneda?: string
          monto?: number
          monto_usd?: number
          nota?: string | null
          org_id?: string
          periodo_cierre_id?: string | null
          referencia?: string | null
          reportado_por?: string | null
          tasa_aplicada?: number | null
          telefono_origen?: string | null
          unidad_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pagos_banco_codigo_fkey"
            columns: ["banco_codigo"]
            isOneToOne: false
            referencedRelation: "bancos"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "pagos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_periodo_cierre_id_fkey"
            columns: ["periodo_cierre_id"]
            isOneToOne: false
            referencedRelation: "periodos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "saldos_actuales"
            referencedColumns: ["unidad_id"]
          },
          {
            foreignKeyName: "pagos_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      partidas_fijas: {
        Row: {
          categoria_id: string
          concepto: string
          id: string
          monto: number
          orden: number
          org_id: string
          referencia: string | null
        }
        Insert: {
          categoria_id: string
          concepto: string
          id?: string
          monto?: number
          orden?: number
          org_id: string
          referencia?: string | null
        }
        Update: {
          categoria_id?: string
          concepto?: string
          id?: string
          monto?: number
          orden?: number
          org_id?: string
          referencia?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partidas_fijas_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partidas_fijas_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      periodos: {
        Row: {
          anio: number
          cerrado_en: string | null
          cerrado_por: string | null
          creado_en: string
          edificio_id: string
          enviado_en: string | null
          enviado_por: string | null
          estado: string
          etiqueta: string
          id: string
          mes: number
          org_id: string
          presupuesto: number | null
          tasa_bcv: number
          total_gastos: number
        }
        Insert: {
          anio: number
          cerrado_en?: string | null
          cerrado_por?: string | null
          creado_en?: string
          edificio_id: string
          enviado_en?: string | null
          enviado_por?: string | null
          estado?: string
          etiqueta: string
          id?: string
          mes: number
          org_id: string
          presupuesto?: number | null
          tasa_bcv?: number
          total_gastos?: number
        }
        Update: {
          anio?: number
          cerrado_en?: string | null
          cerrado_por?: string | null
          creado_en?: string
          edificio_id?: string
          enviado_en?: string | null
          enviado_por?: string | null
          estado?: string
          etiqueta?: string
          id?: string
          mes?: number
          org_id?: string
          presupuesto?: number | null
          tasa_bcv?: number
          total_gastos?: number
        }
        Relationships: [
          {
            foreignKeyName: "periodos_edificio_id_fkey"
            columns: ["edificio_id"]
            isOneToOne: false
            referencedRelation: "edificios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "periodos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      personas: {
        Row: {
          correo: string | null
          creada_en: string
          documento: string | null
          id: string
          nombre: string
          org_id: string
          prefijo: string | null
          telefono: string | null
        }
        Insert: {
          correo?: string | null
          creada_en?: string
          documento?: string | null
          id?: string
          nombre: string
          org_id: string
          prefijo?: string | null
          telefono?: string | null
        }
        Update: {
          correo?: string | null
          creada_en?: string
          documento?: string | null
          id?: string
          nombre?: string
          org_id?: string
          prefijo?: string | null
          telefono?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "personas_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      recibos: {
        Row: {
          a_favor: number
          alicuota: number
          anterior: number
          anterior_hon: number
          anterior_serv: number
          conceptos: Json
          cuota: number
          detalle: Json
          directos: number
          emitido_en: string
          honorario: number
          id: string
          mora: number
          mora_base: number
          numero: string
          org_id: string
          periodo_id: string
          servicio: number
          tasa_bcv: number
          total: number
          unidad_id: string
          vence_el: string | null
        }
        Insert: {
          a_favor?: number
          alicuota: number
          anterior?: number
          anterior_hon?: number
          anterior_serv?: number
          conceptos?: Json
          cuota?: number
          detalle?: Json
          directos?: number
          emitido_en?: string
          honorario?: number
          id?: string
          mora?: number
          mora_base?: number
          numero: string
          org_id: string
          periodo_id: string
          servicio?: number
          tasa_bcv: number
          total?: number
          unidad_id: string
          vence_el?: string | null
        }
        Update: {
          a_favor?: number
          alicuota?: number
          anterior?: number
          anterior_hon?: number
          anterior_serv?: number
          conceptos?: Json
          cuota?: number
          detalle?: Json
          directos?: number
          emitido_en?: string
          honorario?: number
          id?: string
          mora?: number
          mora_base?: number
          numero?: string
          org_id?: string
          periodo_id?: string
          servicio?: number
          tasa_bcv?: number
          total?: number
          unidad_id?: string
          vence_el?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recibos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recibos_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "periodos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recibos_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "saldos_actuales"
            referencedColumns: ["unidad_id"]
          },
          {
            foreignKeyName: "recibos_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      secretos: {
        Row: {
          actualizado: string
          nombre: string
          valor: string
        }
        Insert: {
          actualizado?: string
          nombre: string
          valor: string
        }
        Update: {
          actualizado?: string
          nombre?: string
          valor?: string
        }
        Relationships: []
      }
      suscripciones: {
        Row: {
          actualizada_en: string
          contacto: string | null
          correo: string | null
          creada_en: string
          descuento_pct: number
          dias_gracia: number
          estado: string
          id: string
          inicio: string
          modo_precio: string
          notas: string | null
          org_id: string
          plan: string
          precio: number
          proximo_cobro: string | null
          telefono: string | null
        }
        Insert: {
          actualizada_en?: string
          contacto?: string | null
          correo?: string | null
          creada_en?: string
          descuento_pct?: number
          dias_gracia?: number
          estado?: string
          id?: string
          inicio?: string
          modo_precio?: string
          notas?: string | null
          org_id: string
          plan?: string
          precio?: number
          proximo_cobro?: string | null
          telefono?: string | null
        }
        Update: {
          actualizada_en?: string
          contacto?: string | null
          correo?: string | null
          creada_en?: string
          descuento_pct?: number
          dias_gracia?: number
          estado?: string
          id?: string
          inicio?: string
          modo_precio?: string
          notas?: string | null
          org_id?: string
          plan?: string
          precio?: number
          proximo_cobro?: string | null
          telefono?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suscripciones_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      tareas_log: {
        Row: {
          corrida_en: string
          detalle: Json | null
          id: number
          tarea: string
        }
        Insert: {
          corrida_en?: string
          detalle?: Json | null
          id?: number
          tarea: string
        }
        Update: {
          corrida_en?: string
          detalle?: Json | null
          id?: number
          tarea?: string
        }
        Relationships: []
      }
      tasa_pendiente: {
        Row: {
          pedido_en: string
          request_id: number
        }
        Insert: {
          pedido_en?: string
          request_id: number
        }
        Update: {
          pedido_en?: string
          request_id?: number
        }
        Relationships: []
      }
      tasas_bcv: {
        Row: {
          cargada_en: string
          cargada_por: string | null
          fecha: string
          fuente: string
          tasa: number
        }
        Insert: {
          cargada_en?: string
          cargada_por?: string | null
          fecha: string
          fuente?: string
          tasa: number
        }
        Update: {
          cargada_en?: string
          cargada_por?: string | null
          fecha?: string
          fuente?: string
          tasa?: number
        }
        Relationships: []
      }
      unidades: {
        Row: {
          activa: boolean
          alicuota: number
          codigo: string
          creada_en: string
          edificio_id: string
          id: string
          inquilino_ve: string
          org_id: string
          saldo_inicial: number
          saldo_inicial_hon: number
        }
        Insert: {
          activa?: boolean
          alicuota?: number
          codigo: string
          creada_en?: string
          edificio_id: string
          id?: string
          inquilino_ve?: string
          org_id: string
          saldo_inicial?: number
          saldo_inicial_hon?: number
        }
        Update: {
          activa?: boolean
          alicuota?: number
          codigo?: string
          creada_en?: string
          edificio_id?: string
          id?: string
          inquilino_ve?: string
          org_id?: string
          saldo_inicial?: number
          saldo_inicial_hon?: number
        }
        Relationships: [
          {
            foreignKeyName: "unidades_edificio_id_fkey"
            columns: ["edificio_id"]
            isOneToOne: false
            referencedRelation: "edificios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unidades_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      vinculos: {
        Row: {
          desde: string
          enviar_corte: boolean
          hasta: string | null
          id: string
          org_id: string
          persona_id: string
          tipo: string
          unidad_id: string
        }
        Insert: {
          desde?: string
          enviar_corte?: boolean
          hasta?: string | null
          id?: string
          org_id: string
          persona_id: string
          tipo: string
          unidad_id: string
        }
        Update: {
          desde?: string
          enviar_corte?: boolean
          hasta?: string | null
          id?: string
          org_id?: string
          persona_id?: string
          tipo?: string
          unidad_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vinculos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vinculos_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vinculos_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "saldos_actuales"
            referencedColumns: ["unidad_id"]
          },
          {
            foreignKeyName: "vinculos_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      saldos_actuales: {
        Row: {
          administracion: number | null
          alicuota: number | null
          codigo: string | null
          condominio: number | null
          edificio_id: string | null
          estado: string | null
          mora: number | null
          org_id: string | null
          servicio: number | null
          total: number | null
          unidad_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "unidades_edificio_id_fkey"
            columns: ["edificio_id"]
            isOneToOne: false
            referencedRelation: "edificios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unidades_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      abrir_periodo: {
        Args: {
          p_anio: number
          p_edificio: string
          p_etiqueta: string
          p_mes: number
          p_presupuesto?: number
          p_tasa: number
        }
        Returns: string
      }
      aceptar_invitacion: { Args: { p_token: string }; Returns: string }
      administra_algo: { Args: never; Returns: boolean }
      cargar_tasa: {
        Args: { p_fecha: string; p_tasa: number }
        Returns: undefined
      }
      cartera_operador: {
        Args: never
        Returns: {
          a_favor: number
          cobros_pendientes: number
          contacto: string
          correo: string
          cuota_mes: number
          descuento_pct: number
          dias_gracia: number
          edificios: number
          estado: string
          inicio: string
          modo_precio: string
          monto_pendiente: number
          nombre: string
          notas: string
          org_id: string
          plan: string
          plan_acceso: string
          por_cobrar: number
          precio: number
          presupuesto_mes: number
          proximo_cobro: string
          rif: string
          telefono: string
          ultimo_cierre: string
          unidades: number
          unidades_con_deuda: number
        }[]
      }
      cerrar_periodo: {
        Args: { p_periodo: string }
        Returns: {
          recibos_emitidos: number
          total_facturado: number
        }[]
      }
      completar_tasa: {
        Args: { p_fecha: string; p_tasa: number }
        Returns: undefined
      }
      comprobantes_caducados: {
        Args: never
        Returns: {
          conciliado_en: string
          id: string
          pago_id: string
          ruta: string
        }[]
      }
      correo_recibo: {
        Args: { p_recibo: string }
        Returns: {
          asunto: string
          destino: string
          html: string
          org_id: string
          responder_a: string
          rol: string
          texto: string
          unidad_id: string
        }[]
      }
      correr_cobros_ahora: { Args: never; Returns: Json }
      correr_tasa_ahora: { Args: never; Returns: Json }
      crear_invitacion: {
        Args: {
          p_correo: string
          p_edificio?: string
          p_org: string
          p_relacion?: string
          p_rol: string
          p_unidad?: string
        }
        Returns: string
      }
      crear_organizacion: {
        Args: { p_nombre: string; p_rif?: string }
        Returns: string
      }
      cuota_mensual: { Args: { p_org: string }; Returns: number }
      descartar_periodo: { Args: { p_periodo: string }; Returns: undefined }
      despachar_ahora: { Args: never; Returns: Json }
      despachar_correos: { Args: { p_tanda?: number }; Returns: Json }
      destinatarios_de: {
        Args: { p_unidad: string }
        Returns: {
          correo: string
          enviar: boolean
          nombre: string
          rol: string
          telefono: string
        }[]
      }
      edificios_operador: {
        Args: { p_org: string }
        Returns: {
          edificio_id: string
          morosidad_pct: number
          nombre: string
          por_cobrar: number
          presupuesto: number
          ultimo_cierre: string
          unidades: number
          unidades_con_deuda: number
        }[]
      }
      edificios_visibles: { Args: never; Returns: string[] }
      encolar_prueba: {
        Args: { p_destino: string; p_recibo: string }
        Returns: string
      }
      encolar_recibos: {
        Args: { p_periodo: string }
        Returns: {
          encolados: number
          rebotados: number
          sin_correo: number
          ya_estaban: number
        }[]
      }
      es_operador: { Args: never; Returns: boolean }
      esc_html: { Args: { t: string }; Returns: string }
      estadisticas_periodo: {
        Args: { p_periodo: string }
        Returns: {
          a_favor: number
          anio: number
          cobrado: number
          condominio: number
          cuota_promedio: number
          deuda_arrastrada: number
          deuda_total: number
          directos: number
          estado: string
          etiqueta: string
          facturado_mes: number
          honorarios: number
          mes: number
          mora: number
          pct_cobrado: number
          presupuesto: number
          servicio: number
          tasa_bcv: number
          total_gastos: number
          unidades: number
          unidades_con_deuda: number
        }[]
      }
      exigir_modulo: {
        Args: { p_clave: string; p_edificio?: string; p_org: string }
        Returns: undefined
      }
      fijar_modulo: {
        Args: {
          p_activo: boolean
          p_clave: string
          p_edificio?: string
          p_nota?: string
          p_org: string
        }
        Returns: undefined
      }
      fmt_monto: { Args: { v: number }; Returns: string }
      gastos_por_categoria: {
        Args: { p_periodo: string }
        Returns: {
          categoria: string
          monto: number
          monto_anterior: number
          orden: number
          pct: number
          variacion_pct: number
        }[]
      }
      gastos_sin_categoria: {
        Args: { p_periodo: string }
        Returns: {
          concepto: string
          monto: number
          referencia: string
        }[]
      }
      generar_cobro: {
        Args: { p_desde?: string; p_org: string }
        Returns: string
      }
      generar_cobro_interno: {
        Args: { p_desde?: string; p_org: string }
        Returns: string
      }
      generar_cobros_vencidos: { Args: never; Returns: Json }
      guardar_secreto: {
        Args: { p_nombre: string; p_valor: string }
        Returns: undefined
      }
      hay_secreto: {
        Args: { p_nombre: string }
        Returns: {
          actualizado: string
          cargada: boolean
          largo: number
        }[]
      }
      historial_unidad: {
        Args: { p_unidad: string }
        Returns: {
          abono: number
          cargo: number
          concepto: string
          detalle: string
          fecha: string
          orden: number
          saldo: number
        }[]
      }
      invitaciones_de: {
        Args: { p_org: string }
        Returns: {
          correo: string
          creada_en: string
          edificio: string
          estado: string
          expira_en: string
          id: string
          relacion: string
          rol: string
          unidad: string
          usada_en: string
        }[]
      }
      libro_edificio: {
        Args: { p_desde: string; p_edificio: string; p_hasta: string }
        Returns: {
          categoria: string
          concepto: string
          fecha: string
          monto: number
          seccion: string
        }[]
      }
      marcar_comprobante_borrado: { Args: { p_id: string }; Returns: undefined }
      marcar_enviado: {
        Args: { p_enviado?: boolean; p_periodo: string }
        Returns: undefined
      }
      mi_recibo: {
        Args: { p_unidad: string }
        Returns: {
          a_favor: number
          alicuota: number
          anio: number
          anterior: number
          conceptos: Json
          cuota: number
          detalle: Json
          directos: number
          edificio: string
          etiqueta: string
          honorario: number
          mes: number
          mora: number
          numero: string
          servicio: number
          tasa_bcv: number
          total: number
          vence_el: string
        }[]
      }
      mis_modulos: {
        Args: { p_edificio?: string }
        Returns: {
          activo: boolean
          clave: string
          nombre: string
        }[]
      }
      mis_unidades: {
        Args: never
        Returns: {
          alicuota: number
          codigo: string
          edificio: string
          edificio_id: string
          nivel: string
          org_id: string
          organizacion: string
          recibo_anio: number
          recibo_mes: number
          recibo_numero: string
          recibo_periodo: string
          recibo_total: number
          relacion: string
          saldo: number
          unidad_id: string
        }[]
      }
      modulo_activo: {
        Args: { p_clave: string; p_edificio?: string; p_org: string }
        Returns: boolean
      }
      modulos_de: {
        Args: { p_org: string }
        Returns: {
          activo: boolean
          clave: string
          descripcion: string
          edificio: string
          edificio_id: string
          fijado: boolean
          nombre: string
          nota: string
          nucleo: boolean
          orden: number
          por_defecto: boolean
        }[]
      }
      mora_de: {
        Args: { p_unidad: string }
        Returns: {
          capital: number
          mora: number
          saldo: number
          vence_el: string
        }[]
      }
      morosidad_edificio: {
        Args: { p_edificio: string }
        Returns: {
          monto: number
          orden: number
          pct_monto: number
          tramo: string
          unidades: number
        }[]
      }
      mover_categoria: {
        Args: { p_arriba: boolean; p_id: string }
        Returns: undefined
      }
      mover_gasto: {
        Args: { p_arriba: boolean; p_id: string }
        Returns: undefined
      }
      mover_partida: {
        Args: { p_arriba: boolean; p_id: string }
        Returns: undefined
      }
      orgs_del_usuario: { Args: never; Returns: string[] }
      pagos_por_origen: {
        Args: { p_org: string; p_telefono: string }
        Returns: {
          banco: string
          estado: string
          fecha: string
          id: string
          moneda: string
          monto: number
          referencia: string
          unidad_id: string
        }[]
      }
      pagos_posible_duplicado: {
        Args: { p_org: string; p_referencia: string }
        Returns: {
          banco: string
          fecha: string
          id: string
          monto_usd: number
          unidad_id: string
        }[]
      }
      periodos_corrientes: { Args: never; Returns: string[] }
      periodos_fuera_de_orden: {
        Args: { p_edificio: string }
        Returns: {
          contado: number
          facturado: number
          perdido: number
          unidad: string
        }[]
      }
      permitir_estadisticas: { Args: { p_edificio: string }; Returns: string }
      puede_operar: { Args: { p_org: string }; Returns: boolean }
      reabrir_periodo: {
        Args: { p_confirmar?: boolean; p_periodo: string }
        Returns: undefined
      }
      residentes_de: {
        Args: { p_edificio: string }
        Returns: {
          activo: boolean
          correo: string
          membresia_id: string
          nivel: string
          relacion: string
          unidad: string
          unidad_id: string
          usuario_id: string
        }[]
      }
      resumen_correos: {
        Args: { p_org: string }
        Returns: {
          enviados: number
          fallidos: number
          malos: number
          pendientes: number
          ultimo_envio: string
        }[]
      }
      revocar_invitacion: { Args: { p_id: string }; Returns: undefined }
      saldo_unidad: {
        Args: { p_unidad: string }
        Returns: {
          administracion: number
          condominio: number
          mora: number
          servicio: number
          total: number
        }[]
      }
      saldo_visible: { Args: { p_unidad: string }; Returns: number }
      serie_edificio: {
        Args: { p_edificio: string; p_meses?: number }
        Returns: {
          anio: number
          cobrado: number
          cuota_promedio: number
          deuda_cierre: number
          etiqueta: string
          facturado: number
          gasto: number
          mes: number
          pct_cobrado: number
          unidades: number
        }[]
      }
      simular_cierre: {
        Args: { p_periodo: string }
        Returns: {
          a_favor: number
          administracion: number
          alicuota: number
          anterior: number
          codigo: string
          condominio: number
          mora: number
          servicio: number
          total: number
        }[]
      }
      soltar_modulo: {
        Args: { p_clave: string; p_edificio?: string; p_org: string }
        Returns: undefined
      }
      tasa_atrasada: {
        Args: never
        Returns: {
          dias: number
          fecha: string
          tasa: number
        }[]
      }
      tasa_de_esa_fecha: {
        Args: { p_fecha: string }
        Returns: {
          fecha: string
          fuente: string
          propia: boolean
          tasa: number
        }[]
      }
      tasa_del_dia: { Args: { p_fecha?: string }; Returns: number }
      tiene_rol: {
        Args: { p_org: string; p_roles: string[] }
        Returns: boolean
      }
      top_gastos: {
        Args: { p_n?: number; p_periodo: string }
        Returns: {
          categoria: string
          concepto: string
          monto: number
          pct: number
          referencia: string
        }[]
      }
      traer_tasa_bcv: { Args: never; Returns: Json }
      unidades_historico: { Args: never; Returns: string[] }
      unidades_visibles: { Args: never; Returns: string[] }
      verificar_cortes: {
        Args: { p_edificio: string }
        Returns: {
          diferencia: number
          guardado: number
          recalculado: number
          unidad: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
