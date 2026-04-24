import { TypographyVariant, TypographyVariantsOptions } from '@mui/material'
import React from 'react'

export declare module '@mui/material/styles' {
  interface Theme {
    breakpoints: {
      values: {
        xs: number
        sm: number
        sd: number
        md: number
        lg: number
      }
    }
    shape: {
      radiusNone: number
      radius050: number
      radius100: number
      radius150: number
      radius200: number
      radius300: number
      radius400: number
      radius500: number
      radius600: number
      radiusFull: string
    }
    width: {
      xxs: string
      xs: string
      sm: string
      md: string
      lg: string
      xl: string
      '2xl': string
      '3xl': string
      '4xl': string
      '5xl': string
      '6xl': string
    }
    color: {
      workflowState: {
        todo: string
        inProgress: string
        done: string
      }
      base: {
        black: string
        white: string
      }
      gray: {
        100: string
        150: string
        200: string
        300: string
        400: string
        500: string
        550: string
        600: string
        700: string
      }
      brand: {
        light: string
        midLight: string
        primary: string
        midDark: string
        dark: string
      }
      text: {
        text: string
        textSecondary: string
        textDisabled: string
        textPlaceholder: string
        textPrimary: string
      }
      modal: {
        backdrop: string
      }
      borders: {
        border: string
        borderHover: string
        borderDisabled: string
        border2: string
        border3: string
        focusBorder: string
        focusBorder2: string
      }
      background: {
        bgCard: string
        bgCallout: string
        bgHover: string
        bgCommentDrag: string
        avatarBackground: string
      }
      red: {
        200: string
      }
      error: string
      muiError: string
      link: string
    }
  }

  interface ThemeOptions {
    breakpoints: {
      values: {
        xs: number
        sm: number
        sd: number
        md: number
        lg: number
      }
    }
    shape: {
      radiusNone: number
      radius050: number
      radius100: number
      radius150: number
      radius200: number
      radius300: number
      radius400: number
      radius500: number
      radius600: number
      radiusFull: string
    }
    width: {
      xxs: string
      xs: string
      sm: string
      md: string
      lg: string
      xl: string
      '2xl': string
      '3xl': string
      '4xl': string
      '5xl': string
      '6xl': string
    }
    color: {
      workflowState: {
        todo: React.CSSProperties['color']
        inProgress: React.CSSProperties['color']
        done: React.CSSProperties['color']
      }
      base: {
        black: React.CSSProperties['color']
        white: React.CSSProperties['color']
      }
      gray: {
        100: React.CSSProperties['color']
        150: React.CSSProperties['color']
        200: React.CSSProperties['color']
        300: React.CSSProperties['color']
        400: React.CSSProperties['color']
        500: React.CSSProperties['color']
        550: React.CSSProperties['color']
        600: React.CSSProperties['color']
        700: React.CSSProperties['color']
      }
      brand: {
        light: React.CSSProperties['color']
        midLight: React.CSSProperties['color']
        primary: React.CSSProperties['color']
        midDark: React.CSSProperties['color']
        dark: React.CSSProperties['color']
      }
      text: {
        text: React.CSSProperties['color']
        textSecondary: React.CSSProperties['color']
        textDisabled: React.CSSProperties['color']
        textPlaceholder: React.CSSProperties['color']
        textPrimary: React.CSSProperties['color']
      }
      modal: {
        backdrop: React.CSSProperties['color']
      }
      borders: {
        border: React.CSSProperties['color']
        borderHover: React.CSSProperties['color']
        borderDisabled: React.CSSProperties['color']
        border2: React.CSSProperties['color']
        border3: React.CSSProperties['color']
        focusBorder: React.CSSProperties['color']
        focusBorder2: React.CSSProperties['color']
      }
      background: {
        bgCard: React.CSSProperties['color']
        bgCallout: React.CSSProperties['color']
        bgHover: React.CSSProperties['color']
        bgCommentDrag: React.CSSProperties['color']
        avatarBackground: React.CSSProperties['color']
      }
      red: {
        200: React.CSSProperties['color']
      }
      error: React.CSSProperties['color']
      muiError: React.CSSProperties['color']
      link: React.CSSProperties['color']
    }
  }

  interface TypographyVariants {
    display: React.CSSProperties
    displaySm: React.CSSProperties
    '4xl': React.CSSProperties
    '3xl': React.CSSProperties
    '2xl': React.CSSProperties
    xl: React.CSSProperties
    lg: React.CSSProperties
    md: React.CSSProperties
    sm: React.CSSProperties
    xs: React.CSSProperties
    bodyLg: React.CSSProperties
    bodyMd: React.CSSProperties
    bodySm: React.CSSProperties
    bodyXs: React.CSSProperties
  }

  interface TypographyVariantsOptions {
    display?: React.CSSProperties
    displaySm?: React.CSSProperties
    '4xl'?: React.CSSProperties
    '3xl'?: React.CSSProperties
    '2xl'?: React.CSSProperties
    xl?: React.CSSProperties
    lg?: React.CSSProperties
    md?: React.CSSProperties
    sm?: React.CSSProperties
    xs?: React.CSSProperties
    bodyLg?: React.CSSProperties
    bodyMd?: React.CSSProperties
    bodySm?: React.CSSProperties
    bodyXs?: React.CSSProperties
  }
}

declare module '@mui/material/Typography' {
  interface TypographyPropsVariantOverrides {
    display: true
    displaySm: true
    '4xl': true
    '3xl': true
    '2xl': true
    xl: true
    lg: true
    md: true
    sm: true
    xs: true
    bodyLg: true
    bodyMd: true
    bodySm: true
    bodyXs: true
  }
}
