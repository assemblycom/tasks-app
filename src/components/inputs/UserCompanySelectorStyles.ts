type SelectorStyleFn = (
  base: Record<string, unknown>,
  state?: {
    isFocused?: boolean
  },
) => Record<string, unknown>

interface UserCompanySelectorStyles {
  control: SelectorStyleFn
  placeholder: SelectorStyleFn
  input: SelectorStyleFn
  menu: SelectorStyleFn
  menuList: SelectorStyleFn
}

export const userCompanySelectorStyles: UserCompanySelectorStyles = {
  control: (base) => ({
    ...base,
    borderColor: '#EFF1F4',
    backgroundColor: '#FFFFFF',
    boxShadow: 'none',
    '&:focus-within': {
      borderColor: '#EFF1F4',
    },
  }),
  placeholder: (base) => ({
    ...base,
    fontSize: '13px',
    lineHeight: '20px',
    color: '#9B9FA3',
  }),
  input: (base) => ({
    ...base,
    fontSize: '13px',
    lineHeight: '20px',
    margin: '0px',
    padding: '0px',
  }),
  menu: (base) => ({
    ...base,
    marginTop: 0,
  }),
  menuList: (base) => ({
    ...base,
    marginTop: 0,
    paddingTop: 0,
  }),
}
