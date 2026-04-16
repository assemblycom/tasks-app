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
  control: (base, state) => ({
    ...base,
    borderColor: state?.isFocused ? '#0C41BB' : '#EFF1F4',
    backgroundColor: '#FFFFFF',
    boxShadow: 'none',
    '&:hover': {
      borderColor: state?.isFocused ? '#0C41BB' : '#EFF1F4',
    },
  }),
  placeholder: (base) => ({
    ...base,
    fontSize: '14px',
    lineHeight: '22px',
  }),
  input: (base) => ({
    ...base,
    fontSize: '14px',
    lineHeight: '22px',
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
