'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

import type { CreateChatCompletionResponse } from 'openai'
import { SSE } from 'sse.js'
import { getEdgeFunctionUrl } from '@/lib/utils'
import { X, Loader, User, Frown, CornerDownLeft, Search } from 'lucide-react'

function promptDataReducer(
  state: any[],
  action: {
    index?: number
    answer?: string | undefined
    status?: string
    query?: string | undefined
    type?: 'remove-last-item' | string
  }
) {
  // set a standard state to use later
  let current = [...state]

  if (action.type) {
    switch (action.type) {
      case 'remove-last-item':
        current.pop()
        return [...current]
      default:
        break
    }
  }

  // check that an index is present
  if (action.index === undefined) return [...state]

  if (!current[action.index]) {
    current[action.index] = { query: '', answer: '', status: '' }
  }

  current[action.index].answer = action.answer

  if (action.query) {
    current[action.index].query = action.query
  }
  if (action.status) {
    current[action.index].status = action.status
  }

  return [...current]
}

export function SearchDialog() {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState<string>('')
  const [question, setQuestion] = React.useState<string>('')
  const [answer, setAnswer] = React.useState<string | undefined>('')
  const edgeFunctionUrl = getEdgeFunctionUrl()
  const eventSourceRef = React.useRef<SSE>()
  const [isResponding, setIsResponding] = React.useState(false)
  const [isLoading, setIsLoading] = React.useState(false)
  const [hasClippyError, setHasClippyError] = React.useState(false)
  const [promptIndex, setPromptIndex] = React.useState(0)
  const [promptData, dispatchPromptData] = React.useReducer(promptDataReducer, [])

  const cantHelp = answer?.trim() === "Sorry, I don't know how to help with that."

  const status = isLoading
    ? 'Clippy is searching...'
    : isResponding
    ? 'Clippy is responding...'
    : cantHelp || hasClippyError
    ? 'Clippy has failed you'
    : undefined

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && e.metaKey) {
        setOpen(true)
      }

      if (e.key === 'Escape') {
        console.log('esc')
        handleModalToggle()
      }
    }

    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  function handleModalToggle() {
    setOpen(!open)
    setSearch('')
    setQuestion('')
    setAnswer(undefined)
    setPromptIndex(0)
    dispatchPromptData({ type: 'remove-last-item' })
    setIsResponding(false)
    setHasClippyError(false)
    setIsLoading(false)
  }

  const handleConfirm = React.useCallback(
    async (query: string) => {
      setAnswer(undefined)
      setQuestion(query)
      setSearch('')
      dispatchPromptData({ index: promptIndex, answer: undefined, query })
      setIsResponding(false)
      setHasClippyError(false)
      setIsLoading(true)

      const eventSource = new SSE(`${edgeFunctionUrl}/clippy-search`, {
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        payload: JSON.stringify({ query }),
      })

      function handleError<T>(err: T) {
        setIsLoading(false)
        setIsResponding(false)
        setHasClippyError(true)
        console.error(err)
      }

      eventSource.addEventListener('error', handleError)
      eventSource.addEventListener('message', (e: any) => {
        try {
          setIsLoading(false)

          if (e.data === '[DONE]') {
            setIsResponding(false)
            setPromptIndex((x) => {
              return x + 1
            })
            return
          }

          setIsResponding(true)

          const completionResponse: CreateChatCompletionResponse = JSON.parse(e.data)
          // TODO: figure out why type is incorrect!
          const text = completionResponse.choices[0].text

          setAnswer((answer) => {
            const currentAnswer = answer ?? ''

            dispatchPromptData({
              index: promptIndex,
              answer: currentAnswer + text,
            })

            return (answer ?? '') + text
          })
        } catch (err) {
          handleError(err)
        }
      })

      eventSource.stream()

      eventSourceRef.current = eventSource

      setIsLoading(true)
    },
    [promptIndex, promptData]
  )

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault()
    console.log(search)

    handleConfirm(search)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-base text-slate-500 dark:text-slate-400 flex gap-2 items-center z-50 hover:text-slate-700 transition-colors border border-slate-200 px-4 py-2 rounded-md min-w-[300px] relative"
      >
        <Search width={15} />
        <span className="border border-l h-5"></span>
        <span className="inline-block ml-4">Search...</span>
        <kbd className="absolute right-3 top-2.5 pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-slate-100 bg-slate-100 px-1.5 font-mono text-[10px] font-medium text-slate-600 opacity-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          <span className="text-xs">⌘</span>K
        </kbd>{' '}
      </button>
      <Dialog open={open}>
        <DialogContent className="sm:max-w-[850px] text-black">
          <DialogHeader>
            <DialogTitle>OpenAI powered doc search</DialogTitle>
            <DialogDescription>Build your own ChatGPT style search with Next.js, OpenAI & Supabase.</DialogDescription>
            <hr />
            <button className="absolute top-0 right-2 p-2" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </button>
          </DialogHeader>

          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              {question && (
                <div className="flex gap-4">
                  <span className="bg-slate-100 p-2 w-8 h-8 rounded-full text-center flex items-center justify-center">
                    <User width={18} />{' '}
                  </span>
                  <p className="mt-0.5 font-semibold">{question}</p>
                </div>
              )}
              {/* const status = isLoading ? 'Clippy is searching...' : isResponding ? 'Clippy is responding...' : cantHelp || hasClippyError ?
              'Clippy has failed you' : undefined */}
              {isLoading && (
                <div className="animate-spin relative flex w-5 h-5 ml-2">
                  <Loader />
                </div>
              )}

              {hasClippyError && (
                <div className="flex items-center gap-4">
                  <span className="bg-red-100 p-2 w-8 h-8 rounded-full text-center flex items-center justify-center">
                    <Frown width={18} />
                  </span>
                  Bad news, the search has failed. Try again later.
                </div>
              )}

              {answer && !hasClippyError ? <p>Answer: {answer}</p> : null}

              <div className="relative">
                <Input
                  placeholder="Ask a question..."
                  name="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="col-span-3"
                />
                <CornerDownLeft
                  className={`absolute top-3 right-5 h-4 w-4 text-gray-400 transition-opacity ${search ? 'opacity-100' : 'opacity-0'}`}
                />
              </div>
              <div className="text-xs text-gray-500">
                Or try:{' '}
                <button
                  className="px-1.5 py-0.5 bg-slate-50 hover:bg-slate-100  rounded border border-s-slate-200"
                  onClick={(e) => setSearch('lorem ipsum put a question here?')}
                >
                  lorem ipsum put a question here?
                </button>
              </div>
            </div>
            <DialogFooter>
              <Button type="submit">Ask</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
